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
import { TicketAccess } from '../types/ticket-access.type';
import { isStaff } from '../ticket-policy.util';
import {
  TicketActivityService,
  TicketActivityTypeValue,
} from './ticket-activity.service';
import type { UploadedFile } from '../dto/upload-attachment.dto';
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
  'video/x-msvideo',
  'video/webm',
  'text/plain',
];

const DEFAULT_MAX_SIZE_MB = 25;
const MAX_FILES_PER_UPLOAD = 10;

@Injectable()
export class TicketAttachmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: SupabaseStorageService,
    private readonly activityService: TicketActivityService,
    private readonly auditLogService: AuditLogService,
    private readonly configService: ConfigService,
  ) {}

  async upload(
    access: TicketAccess,
    ticket: any,
    files: UploadedFile[],
    isEvidence: boolean,
    request: Request,
  ) {
    if (!access.organizationId) {
      throw new ForbiddenException('Organization context is required');
    }

    if (!files || files.length === 0) {
      throw new BadRequestException('No files provided');
    }

    if (files.length > MAX_FILES_PER_UPLOAD) {
      throw new BadRequestException(
        `Cannot upload more than ${MAX_FILES_PER_UPLOAD} files at once`,
      );
    }

    const orgSettings = await (
      this.prisma as any
    ).organizationSettings.findUnique({
      where: { organizationId: access.organizationId },
      select: { maxAttachmentSizeMb: true },
    });

    const maxSizeMb = orgSettings?.maxAttachmentSizeMb ?? DEFAULT_MAX_SIZE_MB;
    const maxSizeBytes = maxSizeMb * 1024 * 1024;
    const bucket =
      this.configService.get<string>('supabase.bucket') ?? 'supportflow';

    for (const file of files) {
      if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
        throw new BadRequestException(
          `Unsupported file type: ${file.mimetype}. Allowed: images, PDF, Word, Excel, ZIP, videos, text.`,
        );
      }
      if (file.size > maxSizeBytes) {
        throw new BadRequestException(
          `File "${file.originalname}" exceeds the ${maxSizeMb}MB limit`,
        );
      }
    }

    const created: any[] = [];

    for (const file of files) {
      const extension =
        extname(file.originalname) ||
        `.${file.mimetype.split('/')[1] ?? 'bin'}`;
      const storedName = `${randomUUID()}${extension}`;
      const path = `tickets/${access.organizationId}/${ticket.id}/${storedName}`;

      const { error } = await this.storageService.uploadFile(
        bucket,
        path,
        file.buffer,
        file.mimetype,
      );
      if (error) {
        throw new BadRequestException(`Upload failed: ${error.message}`);
      }

      const publicUrl = this.storageService.getPublicUrl(bucket, path);

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
          publicUrl,
          fileType: this.resolveFileType(file.mimetype),
          isPublic: false,
        },
      });

      const attachment = await (this.prisma as any).ticketAttachment.create({
        data: {
          organizationId: access.organizationId,
          ticketId: ticket.id,
          uploadedById: access.userId,
          fileId: fileUpload.id,
          originalName: file.originalname,
          storedName,
          mimeType: file.mimetype,
          fileSize: BigInt(file.size),
          bucket,
          path,
          publicUrl,
          isEvidence,
        },
      });

      created.push(attachment);
    }

    await (this.prisma as any).ticket.update({
      where: { id: ticket.id },
      data: { lastActivityAt: new Date() },
    });

    await this.activityService.create({
      organizationId: access.organizationId,
      ticketId: ticket.id,
      actorId: access.userId,
      activityType: TicketActivityTypeValue.ATTACHMENT_ADDED,
      title: `${files.length} file(s) uploaded`,
      metadata: { count: files.length, isEvidence },
    });

    await this.auditLogService.record({
      organizationId: access.organizationId,
      actorId: access.userId,
      actorEmail: access.email,
      action: AUDIT_ACTIONS.CREATE,
      entityType: 'TicketAttachment',
      entityId: ticket.id,
      metadata: { count: files.length, isEvidence },
      request,
    });

    return created;
  }

  async remove(
    access: TicketAccess,
    ticket: any,
    attachmentId: string,
    request: Request,
  ) {
    const attachment = await (this.prisma as any).ticketAttachment.findFirst({
      where: {
        id: attachmentId,
        ticketId: ticket.id,
        organizationId: access.organizationId,
      },
    });

    if (!attachment) {
      throw new NotFoundException('Attachment not found');
    }

    const canDelete =
      isStaff(access) || attachment.uploadedById === access.userId;
    if (!canDelete) {
      throw new ForbiddenException(
        'You do not have permission to delete this attachment',
      );
    }

    await this.storageService.removeFile(attachment.bucket, attachment.path);

    if (attachment.fileId) {
      await (this.prisma as any).fileUpload.delete({
        where: { id: attachment.fileId },
      });
    }
    await (this.prisma as any).ticketAttachment.delete({
      where: { id: attachment.id },
    });

    await this.activityService.create({
      organizationId: ticket.organizationId,
      ticketId: ticket.id,
      actorId: access.userId,
      activityType: TicketActivityTypeValue.ATTACHMENT_DELETED,
      title: `Attachment removed`,
      metadata: { originalName: attachment.originalName },
    });

    await this.auditLogService.record({
      organizationId: ticket.organizationId,
      actorId: access.userId,
      actorEmail: access.email,
      action: AUDIT_ACTIONS.DELETE,
      entityType: 'TicketAttachment',
      entityId: attachment.id,
      request,
    });

    return null;
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
}
