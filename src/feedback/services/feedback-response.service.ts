import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import { PrismaService } from '../../prisma/prisma.service';
import { SupabaseStorageService } from '../../storage/supabase.storage.service';
import {
  AuditLogService,
  AUDIT_ACTIONS,
} from '../../audit-log/audit-log.service';
import { PaginationUtil } from '../../common/utils/pagination.util';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { FeedbackAccess } from '../types/feedback-access.type';
import { assertIsCustomer, isStaff } from '../feedback-policy.util';
import {
  FeedbackFormStatus,
  FeedbackResponseStatus,
} from '../enums/feedback.enums';
import {
  parseAnswersJson,
  validateAndSerializeAnswers,
} from '../feedback-validation.util';
import { SubmitFeedbackDto } from '../dto/submit-feedback.dto';
import { UpdateFeedbackDto } from '../dto/update-feedback.dto';
import { FeedbackRequestService } from './feedback-request.service';
import { FeedbackNotificationService } from './feedback-notification.service';
import type { UploadedFile } from '../dto/submit-feedback.dto';
import type { Request } from 'express';

const ALLOWED_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/svg+xml',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/zip',
  'application/x-zip-compressed',
  'video/mp4',
  'video/quicktime',
  'video/webm',
  'text/plain',
];

const DEFAULT_MAX_SIZE_MB = 25;
const MAX_FILES_PER_SUBMISSION = 10;

@Injectable()
export class FeedbackResponseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: SupabaseStorageService,
    private readonly requestService: FeedbackRequestService,
    private readonly notificationService: FeedbackNotificationService,
    private readonly auditLogService: AuditLogService,
    private readonly configService: ConfigService,
  ) {}

  async submit(
    access: FeedbackAccess,
    dto: SubmitFeedbackDto,
    files: UploadedFile[],
    request: Request,
  ) {
    assertIsCustomer(access);
    if (!access.organizationId) {
      throw new ForbiddenException('Organization context is required');
    }

    const context = await this.resolveSubmissionContext(access, dto);
    const { form, ticket } = context;

    const submitted = parseAnswersJson(dto.answers);
    const validated = validateAndSerializeAnswers(form.questions, submitted);

    if (form.requireComment && !dto.publicComment && !dto.privateComment) {
      throw new BadRequestException('A comment is required for this survey');
    }

    const customer = await (this.prisma as any).user.findUnique({
      where: { id: access.userId },
      select: { id: true, email: true, firstName: true, lastName: true },
    });

    const attachments = await this.uploadAttachments(access, files);

    const response = await (this.prisma as any).feedbackResponse.create({
      data: {
        organizationId: access.organizationId,
        formId: form.id,
        submittedById: access.userId,
        ticketId: ticket.id,
        requestId: context.requestRow?.id ?? null,
        status: FeedbackResponseStatus.SUBMITTED,
        publicComment: dto.publicComment ?? null,
        privateComment: dto.privateComment ?? null,
        ratings: Object.keys(validated.ratings).length
          ? validated.ratings
          : undefined,
        overallScore: validated.overallScore,
        npsScore: validated.npsScore,
        customerName: customer
          ? `${customer.firstName} ${customer.lastName}`.trim()
          : null,
        customerEmail: customer?.email ?? null,
        answers: {
          create: validated.answers.map((a) => ({
            organizationId: access.organizationId,
            questionId: a.questionId,
            answerText: a.answerText ?? null,
            answerNumber: a.answerNumber ?? null,
            answerBoolean: a.answerBoolean ?? null,
            answerDate: a.answerDate ?? null,
            answerOptions: a.answerOptions?.length
              ? a.answerOptions
              : undefined,
          })),
        },
        attachments: {
          create: attachments.map((att) => ({
            organizationId: access.organizationId,
            uploadedById: access.userId,
            fileId: att.fileId,
            originalName: att.originalName,
            storedName: att.storedName,
            mimeType: att.mimeType,
            fileSize: att.fileSize,
            bucket: att.bucket,
            path: att.path,
            publicUrl: att.publicUrl,
          })),
        },
      },
      include: {
        form: { select: { id: true, title: true, thankYouMessage: true } },
        ticket: { select: { id: true, ticketNumber: true, subject: true } },
        answers: { include: { question: true } },
        attachments: true,
      },
    });

    if (context.requestRow?.id) {
      await this.requestService.markCompleted(
        context.requestRow.id,
        response.submittedAt,
      );
    }

    await this.auditLogService.record({
      organizationId: access.organizationId,
      actorId: access.userId,
      actorEmail: access.email,
      action: AUDIT_ACTIONS.FEEDBACK_SUBMITTED,
      entityType: 'FeedbackResponse',
      entityId: response.id,
      metadata: {
        formId: form.id,
        ticketId: ticket.id,
        overallScore: validated.overallScore,
      },
      request,
    });

    await this.notificationService.notifyFeedbackSubmitted({
      organizationId: access.organizationId,
      ticketNumber: ticket.ticketNumber,
      customerName: customer
        ? `${customer.firstName} ${customer.lastName}`.trim()
        : 'A customer',
      ratingLabel: this.ratingLabel(validated.overallScore),
      publicComment: dto.publicComment ?? null,
      overallScore: validated.overallScore,
      responseId: response.id,
    });

    return response;
  }

  async update(
    access: FeedbackAccess,
    responseId: string,
    dto: UpdateFeedbackDto,
    request: Request,
  ) {
    assertIsCustomer(access);
    if (!access.organizationId) {
      throw new ForbiddenException('Organization context is required');
    }

    const response = await (this.prisma as any).feedbackResponse.findFirst({
      where: { id: responseId, organizationId: access.organizationId },
      include: { form: { include: { questions: true } } },
    });

    if (!response) {
      throw new NotFoundException('Feedback response not found');
    }
    if (response.submittedById !== access.userId) {
      throw new ForbiddenException('You do not have access to this feedback');
    }

    const settings = await (this.prisma as any).organizationSettings.findUnique(
      {
        where: { organizationId: access.organizationId },
        select: { allowFeedbackEditing: true },
      },
    );
    if (!settings?.allowFeedbackEditing) {
      throw new ForbiddenException(
        'The organization does not allow editing feedback responses',
      );
    }
    if (
      response.form.expiresAt &&
      new Date(response.form.expiresAt).getTime() < Date.now()
    ) {
      throw new BadRequestException(
        'This survey has expired and can no longer be edited',
      );
    }

    let ratingsUpdate:
      | {
          ratings?: Record<string, number>;
          overallScore?: number | null;
          npsScore?: number | null;
        }
      | undefined;

    if (dto.answers) {
      const submitted = parseAnswersJson(dto.answers);
      const validated = validateAndSerializeAnswers(
        response.form.questions,
        submitted,
      );
      await (this.prisma as any).feedbackAnswer.deleteMany({
        where: { responseId: response.id },
      });
      await (this.prisma as any).feedbackAnswer.createMany({
        data: validated.answers.map((a) => ({
          organizationId: access.organizationId,
          responseId: response.id,
          questionId: a.questionId,
          answerText: a.answerText ?? null,
          answerNumber: a.answerNumber ?? null,
          answerBoolean: a.answerBoolean ?? null,
          answerDate: a.answerDate ?? null,
          answerOptions: a.answerOptions?.length ? a.answerOptions : undefined,
        })),
      });
      ratingsUpdate = {
        ratings: Object.keys(validated.ratings).length
          ? validated.ratings
          : undefined,
        overallScore: validated.overallScore,
        npsScore: validated.npsScore,
      };
    }

    const data: Record<string, unknown> = {
      status: FeedbackResponseStatus.EDITED,
      editedAt: new Date(),
    };
    if (dto.publicComment !== undefined) data.publicComment = dto.publicComment;
    if (dto.privateComment !== undefined)
      data.privateComment = dto.privateComment;
    if (ratingsUpdate) {
      data.ratings = ratingsUpdate.ratings ?? null;
      data.overallScore = ratingsUpdate.overallScore;
      data.npsScore = ratingsUpdate.npsScore;
    }

    const updated = await (this.prisma as any).feedbackResponse.update({
      where: { id: response.id },
      data,
      include: {
        form: { select: { id: true, title: true } },
        ticket: { select: { id: true, ticketNumber: true, subject: true } },
        answers: { include: { question: true } },
        attachments: true,
      },
    });

    await this.auditLogService.record({
      organizationId: access.organizationId,
      actorId: access.userId,
      actorEmail: access.email,
      action: AUDIT_ACTIONS.FEEDBACK_UPDATED,
      entityType: 'FeedbackResponse',
      entityId: response.id,
      metadata: { updatedFields: Object.keys(dto) },
      request,
    });

    return updated;
  }

  async getPending(access: FeedbackAccess, pagination: PaginationQueryDto) {
    assertIsCustomer(access);
    return this.requestService.listPending(access, pagination);
  }

  async getHistory(access: FeedbackAccess, pagination: PaginationQueryDto) {
    assertIsCustomer(access);
    if (!access.organizationId) {
      throw new ForbiddenException('Organization context is required');
    }

    const page = PaginationUtil.normalizePage(pagination.page);
    const limit = PaginationUtil.normalizeLimit(pagination.limit);

    const where: any = {
      submittedById: access.userId,
      organizationId: access.organizationId,
    };

    const [items, total] = await Promise.all([
      (this.prisma as any).feedbackResponse.findMany({
        where,
        orderBy: { submittedAt: 'desc' },
        skip: PaginationUtil.getSkip(page, limit),
        take: limit,
        include: {
          form: { select: { id: true, title: true, thankYouMessage: true } },
          ticket: { select: { id: true, ticketNumber: true, subject: true } },
          answers: { include: { question: true } },
          attachments: true,
        },
      }),
      (this.prisma as any).feedbackResponse.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  async getOne(access: FeedbackAccess, responseId: string, request: Request) {
    const where: any = { id: responseId };
    if (access.organizationId) where.organizationId = access.organizationId;

    const response = await (this.prisma as any).feedbackResponse.findFirst({
      where,
      include: {
        form: { select: { id: true, title: true } },
        ticket: {
          select: {
            id: true,
            ticketNumber: true,
            subject: true,
            status: true,
            assignedTo: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
          },
        },
        submittedBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            avatarUrl: true,
          },
        },
        answers: { include: { question: true } },
        attachments: true,
        request: {
          select: {
            id: true,
            status: true,
            submittedAt: true,
            createdAt: true,
          },
        },
      },
    });

    if (!response) {
      throw new NotFoundException('Feedback response not found');
    }

    if (access.isCustomer && response.submittedById !== access.userId) {
      throw new ForbiddenException('You do not have access to this feedback');
    }
    if (!isStaff(access) && !access.isCustomer) {
      throw new ForbiddenException('You do not have access to this feedback');
    }

    if (isStaff(access)) {
      await this.auditLogService.record({
        organizationId: response.organizationId,
        actorId: access.userId,
        actorEmail: access.email,
        action: AUDIT_ACTIONS.FEEDBACK_VIEWED,
        entityType: 'FeedbackResponse',
        entityId: response.id,
        metadata: { ticketNumber: response.ticket?.ticketNumber ?? null },
        request,
      });
    }

    return response;
  }

  // --------------------------------------------------------------------------
  // Private helpers
  // --------------------------------------------------------------------------

  private async resolveSubmissionContext(
    access: FeedbackAccess,
    dto: SubmitFeedbackDto,
  ) {
    if (dto.requestId) {
      const result = await this.requestService.findForSubmission(
        access,
        dto.requestId,
      );
      if (!result) {
        throw new NotFoundException('Feedback request not found');
      }
      if (result.error === 'forbidden') {
        throw new ForbiddenException(
          'You do not have access to this feedback request',
        );
      }
      if (result.error === 'already_submitted') {
        throw new BadRequestException(
          'You have already submitted feedback for this request',
        );
      }
      if (result.error === 'expired') {
        throw new BadRequestException(
          'This survey has expired and can no longer be submitted',
        );
      }
      if (result.error === 'ticket_not_resolved') {
        throw new BadRequestException(
          'Feedback can only be submitted after the ticket has been resolved or closed',
        );
      }
      return {
        form: result.request.form,
        ticket: result.request.ticket,
        requestRow: result.request,
      };
    }

    if (dto.formId && dto.ticketId) {
      const form = await (this.prisma as any).feedbackForm.findFirst({
        where: {
          id: dto.formId,
          organizationId: access.organizationId,
          status: FeedbackFormStatus.ACTIVE,
        },
        include: { questions: { orderBy: { sortOrder: 'asc' } } },
      });
      if (!form) {
        throw new NotFoundException('Feedback form not found');
      }
      if (form.expiresAt && new Date(form.expiresAt).getTime() < Date.now()) {
        throw new BadRequestException('This survey has expired');
      }

      const ticket = await (this.prisma as any).ticket.findFirst({
        where: {
          id: dto.ticketId,
          organizationId: access.organizationId,
          createdById: access.userId,
        },
      });
      if (!ticket) {
        throw new NotFoundException('Ticket not found');
      }
      const isResolved =
        ticket.status === 'RESOLVED' ||
        ticket.status === 'CLOSED' ||
        Boolean(ticket.resolvedAt || ticket.closedAt);
      if (!isResolved) {
        throw new BadRequestException(
          'Feedback can only be submitted after the ticket has been resolved or closed',
        );
      }

      const existingCount = await (this.prisma as any).feedbackResponse.count({
        where: {
          ticketId: ticket.id,
          formId: form.id,
          submittedById: access.userId,
        },
      });
      if (existingCount > 0 && !form.allowMultipleResponses) {
        throw new BadRequestException(
          'You have already submitted feedback for this ticket',
        );
      }

      return { form, ticket, requestRow: null };
    }

    throw new BadRequestException(
      'Provide a requestId or both formId and ticketId',
    );
  }

  private async uploadAttachments(
    access: FeedbackAccess,
    files?: UploadedFile[],
  ) {
    if (!files || files.length === 0) return [];

    if (files.length > MAX_FILES_PER_SUBMISSION) {
      throw new BadRequestException(
        `Cannot upload more than ${MAX_FILES_PER_SUBMISSION} files at once`,
      );
    }

    const maxSizeMb = DEFAULT_MAX_SIZE_MB;
    const maxSizeBytes = maxSizeMb * 1024 * 1024;
    const bucket =
      this.configService.get<string>('supabase.bucket') ?? 'supportflow';

    const uploaded: Array<{
      fileId: string;
      originalName: string;
      storedName: string;
      mimeType: string;
      fileSize: bigint;
      bucket: string;
      path: string;
      publicUrl: string | null;
    }> = [];

    for (const file of files) {
      if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
        throw new BadRequestException(
          `Unsupported file type: ${file.mimetype}`,
        );
      }
      if (file.size > maxSizeBytes) {
        throw new BadRequestException(
          `File "${file.originalname}" exceeds the ${maxSizeMb}MB limit`,
        );
      }

      const extension =
        extname(file.originalname) ||
        `.${file.mimetype.split('/')[1] ?? 'bin'}`;
      const storedName = `${randomUUID()}${extension}`;
      const path = `feedback/${access.organizationId}/${storedName}`;

      const { error } = await this.storageService.uploadFile(
        bucket,
        path,
        file.buffer,
        file.mimetype,
      );
      if (error) {
        throw new BadRequestException(`Upload failed: ${error.message}`);
      }

      const fileUpload = await (this.prisma as any).fileUpload.create({
        data: {
          organizationId: access.organizationId,
          uploadedById: access.userId,
          originalName: file.originalname,
          storedName,
          mimeType: file.mimetype,
          fileSize: BigInt(file.size),
          bucket,
          path,
          publicUrl: this.storageService.getPublicUrl(bucket, path),
          fileType: this.resolveFileType(file.mimetype),
          isPublic: false,
        },
      });

      uploaded.push({
        fileId: fileUpload.id,
        originalName: file.originalname,
        storedName,
        mimeType: file.mimetype,
        fileSize: BigInt(file.size),
        bucket,
        path,
        publicUrl: this.storageService.getPublicUrl(bucket, path),
      });
    }

    return uploaded;
  }

  private resolveFileType(mimeType: string): string {
    if (mimeType.startsWith('image/')) return 'IMAGE';
    if (mimeType.startsWith('video/')) return 'VIDEO';
    if (mimeType.includes('pdf')) return 'DOCUMENT';
    if (mimeType.includes('word') || mimeType.includes('msword'))
      return 'DOCUMENT';
    if (mimeType.includes('excel') || mimeType.includes('sheet'))
      return 'SPREADSHEET';
    if (mimeType.includes('zip') || mimeType.includes('compressed'))
      return 'ARCHIVE';
    return 'OTHER';
  }

  private ratingLabel(overall: number | null): string {
    if (overall === null) return 'n/a';
    return `${overall}/5`;
  }
}
