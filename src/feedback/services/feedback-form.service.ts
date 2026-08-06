import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  AuditLogService,
  AUDIT_ACTIONS,
} from '../../audit-log/audit-log.service';
import { FeedbackAccess } from '../types/feedback-access.type';
import { CreateFeedbackFormDto } from '../dto/create-feedback-form.dto';
import { UpdateFeedbackFormDto } from '../dto/update-feedback-form.dto';
import { PaginationUtil } from '../../common/utils/pagination.util';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { FeedbackFormStatus } from '../enums/feedback.enums';
import { isStaff } from '../feedback-policy.util';
import { FeatureGateService } from '../../subscriptions/services/feature-gate.service';
import { UsageTrackingService } from '../../subscriptions/services/usage-tracking.service';
import { UsageResourceTypeValue } from '../../subscriptions/enums/subscription.enums';
import type { Request } from 'express';

@Injectable()
export class FeedbackFormService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
    private readonly featureGateService: FeatureGateService,
    private readonly usageTrackingService: UsageTrackingService,
  ) {}

  async create(
    access: FeedbackAccess,
    dto: CreateFeedbackFormDto,
    request: Request,
  ) {
    if (!isStaff(access)) {
      throw new ForbiddenException(
        'Only support agents or tenant owners can create feedback forms',
      );
    }
    if (!access.organizationId) {
      throw new ForbiddenException('Organization context is required');
    }

    // Enforce the organization's plan: feedback feature + form limit.
    await this.featureGateService.assertFeatureEnabled(
      access.organizationId,
      'feedback',
    );
    await this.featureGateService.assertUnderLimit(
      access.organizationId,
      UsageResourceTypeValue.FEEDBACK_FORM,
      1,
      'maxFeedbackForms' as any,
    );

    await this.assertSlugAvailable(access.organizationId, dto.slug);

    const questions = (dto.questions ?? []).map((q, index) => ({
      questionType: q.questionType,
      label: q.label,
      description: q.description ?? null,
      placeholder: q.placeholder ?? null,
      required: q.required ?? false,
      key: q.key ?? null,
      options: q.options?.length ? q.options : undefined,
      validation: q.validation ?? undefined,
      sortOrder: q.sortOrder ?? index,
      isActive: q.isActive ?? true,
    }));

    const form = await (this.prisma as any).feedbackForm.create({
      data: {
        organizationId: access.organizationId,
        categoryId: dto.categoryId ?? null,
        createdById: access.userId,
        title: dto.title,
        description: dto.description ?? null,
        slug: dto.slug ?? null,
        status: dto.status ?? FeedbackFormStatus.DRAFT,
        isPublic: dto.isPublic ?? false,
        allowAnonymous: dto.allowAnonymous ?? false,
        notifyByEmail: dto.notifyByEmail ?? false,
        welcomeMessage: dto.welcomeMessage ?? null,
        thankYouMessage: dto.thankYouMessage ?? null,
        redirectUrl: dto.redirectUrl ?? null,
        publishedAt: dto.publishedAt ? new Date(dto.publishedAt) : null,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
        isSatisfactionSurvey: dto.isSatisfactionSurvey ?? false,
        allowMultipleResponses: dto.allowMultipleResponses ?? false,
        requireComment: dto.requireComment ?? false,
        questions: questions.length ? { create: questions } : undefined,
      },
      include: { questions: { orderBy: { sortOrder: 'asc' } } },
    });

    await this.auditLogService.record({
      organizationId: access.organizationId,
      actorId: access.userId,
      actorEmail: access.email,
      action: AUDIT_ACTIONS.CREATE,
      entityType: 'FeedbackForm',
      entityId: form.id,
      metadata: { title: form.title },
      request,
    });

    return form;
  }

  async update(
    access: FeedbackAccess,
    formId: string,
    dto: UpdateFeedbackFormDto,
    request: Request,
  ) {
    if (!isStaff(access)) {
      throw new ForbiddenException(
        'Only support agents or tenant owners can update feedback forms',
      );
    }
    if (!access.organizationId) {
      throw new ForbiddenException('Organization context is required');
    }

    const form = await this.findOwnedForm(access, formId);

    if (dto.slug !== undefined) {
      await this.assertSlugAvailable(access.organizationId, dto.slug, formId);
    }

    const responseCount = await (this.prisma as any).feedbackResponse.count({
      where: { formId: form.id },
    });
    if (dto.questions && responseCount > 0) {
      throw new BadRequestException(
        'Questions cannot be modified after responses have been submitted',
      );
    }

    const data: Record<string, unknown> = {};
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.slug !== undefined) data.slug = dto.slug;
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.isPublic !== undefined) data.isPublic = dto.isPublic;
    if (dto.allowAnonymous !== undefined)
      data.allowAnonymous = dto.allowAnonymous;
    if (dto.notifyByEmail !== undefined) data.notifyByEmail = dto.notifyByEmail;
    if (dto.welcomeMessage !== undefined)
      data.welcomeMessage = dto.welcomeMessage;
    if (dto.thankYouMessage !== undefined)
      data.thankYouMessage = dto.thankYouMessage;
    if (dto.redirectUrl !== undefined) data.redirectUrl = dto.redirectUrl;
    if (dto.publishedAt !== undefined)
      data.publishedAt = dto.publishedAt ? new Date(dto.publishedAt) : null;
    if (dto.expiresAt !== undefined)
      data.expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : null;
    if (dto.categoryId !== undefined) data.categoryId = dto.categoryId;
    if (dto.isSatisfactionSurvey !== undefined)
      data.isSatisfactionSurvey = dto.isSatisfactionSurvey;
    if (dto.allowMultipleResponses !== undefined)
      data.allowMultipleResponses = dto.allowMultipleResponses;
    if (dto.requireComment !== undefined)
      data.requireComment = dto.requireComment;

    if (dto.questions) {
      await (this.prisma as any).feedbackQuestion.deleteMany({
        where: { formId: form.id },
      });
      await (this.prisma as any).feedbackQuestion.createMany({
        data: dto.questions.map((q, index) => ({
          organizationId: access.organizationId,
          formId: form.id,
          questionType: q.questionType,
          label: q.label,
          description: q.description ?? null,
          placeholder: q.placeholder ?? null,
          required: q.required ?? false,
          key: q.key ?? null,
          options: q.options?.length ? q.options : undefined,
          validation: q.validation ?? undefined,
          sortOrder: q.sortOrder ?? index,
          isActive: q.isActive ?? true,
        })),
      });
    }

    const updated = await (this.prisma as any).feedbackForm.update({
      where: { id: form.id },
      data,
      include: { questions: { orderBy: { sortOrder: 'asc' } } },
    });

    await this.auditLogService.record({
      organizationId: access.organizationId,
      actorId: access.userId,
      actorEmail: access.email,
      action: AUDIT_ACTIONS.UPDATE,
      entityType: 'FeedbackForm',
      entityId: form.id,
      metadata: { updatedFields: Object.keys(dto) },
      request,
    });

    return updated;
  }

  async remove(access: FeedbackAccess, formId: string, request: Request) {
    if (!isStaff(access)) {
      throw new ForbiddenException(
        'Only support agents or tenant owners can delete feedback forms',
      );
    }
    if (!access.organizationId) {
      throw new ForbiddenException('Organization context is required');
    }

    const form = await this.findOwnedForm(access, formId);

    const responseCount = await (this.prisma as any).feedbackResponse.count({
      where: { formId: form.id },
    });

    if (responseCount > 0) {
      const archived = await (this.prisma as any).feedbackForm.update({
        where: { id: form.id },
        data: { status: FeedbackFormStatus.ARCHIVED },
      });
      await this.auditLogService.record({
        organizationId: access.organizationId,
        actorId: access.userId,
        actorEmail: access.email,
        action: AUDIT_ACTIONS.DELETE,
        entityType: 'FeedbackForm',
        entityId: form.id,
        metadata: { archived: true },
        request,
      });
      return archived;
    }

    await (this.prisma as any).feedbackForm.delete({ where: { id: form.id } });

    await this.auditLogService.record({
      organizationId: access.organizationId,
      actorId: access.userId,
      actorEmail: access.email,
      action: AUDIT_ACTIONS.DELETE,
      entityType: 'FeedbackForm',
      entityId: form.id,
      request,
    });

    return null;
  }

  async list(access: FeedbackAccess, pagination: PaginationQueryDto) {
    const page = PaginationUtil.normalizePage(pagination.page);
    const limit = PaginationUtil.normalizeLimit(pagination.limit);

    const where: any = {};
    if (access.isCustomer) {
      if (!access.organizationId) {
        throw new ForbiddenException('Organization context is required');
      }
      where.organizationId = access.organizationId;
      where.status = FeedbackFormStatus.ACTIVE;
      where.isPublic = true;
    } else if (access.organizationId) {
      where.organizationId = access.organizationId;
    }

    const [items, total] = await Promise.all([
      (this.prisma as any).feedbackForm.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: PaginationUtil.getSkip(page, limit),
        take: limit,
        include: {
          category: { select: { id: true, name: true, color: true } },
          _count: { select: { questions: true, responses: true } },
        },
      }),
      (this.prisma as any).feedbackForm.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  async getOne(access: FeedbackAccess, formId: string) {
    const where: any = { id: formId };
    if (access.isCustomer) {
      if (!access.organizationId) {
        throw new ForbiddenException('Organization context is required');
      }
      where.organizationId = access.organizationId;
      where.status = FeedbackFormStatus.ACTIVE;
      where.isPublic = true;
    } else if (access.organizationId) {
      where.organizationId = access.organizationId;
    }

    const form = await (this.prisma as any).feedbackForm.findFirst({
      where,
      include: {
        category: { select: { id: true, name: true, color: true } },
        questions: {
          where: access.isCustomer ? { isActive: true } : undefined,
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    if (!form) {
      throw new NotFoundException('Feedback form not found');
    }

    return form;
  }

  async findQuestions(access: FeedbackAccess, formId: string) {
    const where: any = { formId };
    if (access.organizationId) {
      where.organization = { is: { id: access.organizationId } };
    }
    return (this.prisma as any).feedbackQuestion.findMany({
      where,
      orderBy: { sortOrder: 'asc' },
    });
  }

  private async findOwnedForm(access: FeedbackAccess, formId: string) {
    const form = await (this.prisma as any).feedbackForm.findFirst({
      where: access.organizationId
        ? { id: formId, organizationId: access.organizationId }
        : { id: formId },
    });

    if (!form) {
      throw new NotFoundException('Feedback form not found');
    }

    return form;
  }

  private async assertSlugAvailable(
    organizationId: string,
    slug?: string,
    excludeId?: string,
  ) {
    if (!slug) return;
    const existing = await (this.prisma as any).feedbackForm.findFirst({
      where: {
        organizationId,
        slug,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true },
    });
    if (existing) {
      throw new BadRequestException(
        `A form with slug "${slug}" already exists`,
      );
    }
  }
}
