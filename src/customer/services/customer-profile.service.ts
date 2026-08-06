import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import { PrismaService } from '../../prisma/prisma.service';
import { SupabaseStorageService } from '../../storage/supabase.storage.service';
import { PasswordUtil } from '../../common/utils/password.util';
import {
  AuditLogService,
  AUDIT_ACTIONS,
} from '../../audit-log/audit-log.service';
import { UpdateProfileDto } from '../dto/update-profile.dto';
import { ChangeCustomerPasswordDto } from '../dto/change-customer-password.dto';
import { UpdatePreferencesDto } from '../dto/update-preferences.dto';
import type { UploadedFile } from '../dto/upload-avatar.dto';
import type { Request } from 'express';

const ALLOWED_AVATAR_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
];
const MAX_AVATAR_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

@Injectable()
export class CustomerProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: SupabaseStorageService,
    private readonly auditLogService: AuditLogService,
    private readonly configService: ConfigService,
  ) {}

  async getProfile(userId: string, organizationId: string) {
    const user = await this.findOwnedUser(userId, organizationId);

    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone,
      avatarUrl: user.avatarUrl,
      role: user.role,
      status: user.status,
      timezone: user.timezone,
      locale: user.locale,
      darkMode: user.darkMode,
      emailVerified: user.emailVerified,
      organizationId: user.organizationId,
      createdAt: user.createdAt,
    };
  }

  async updateProfile(
    userId: string,
    organizationId: string,
    dto: UpdateProfileDto,
    request: Request,
  ) {
    const user = await this.findOwnedUser(userId, organizationId);

    const updatedUser = await (this.prisma as any).user.update({
      where: { id: user.id },
      data: {
        firstName: dto.firstName,
        lastName: dto.lastName,
        phone: dto.phone,
        timezone: dto.timezone,
        locale: dto.locale,
      },
    });

    await this.auditLogService.record({
      organizationId,
      actorId: user.id,
      actorEmail: user.email,
      actorName: `${user.firstName} ${user.lastName}`,
      action: AUDIT_ACTIONS.PROFILE_UPDATE,
      entityType: 'User',
      entityId: user.id,
      metadata: { updatedFields: Object.keys(dto) },
      request,
    });

    return {
      id: updatedUser.id,
      email: updatedUser.email,
      firstName: updatedUser.firstName,
      lastName: updatedUser.lastName,
      phone: updatedUser.phone,
      avatarUrl: updatedUser.avatarUrl,
      timezone: updatedUser.timezone,
      locale: updatedUser.locale,
    };
  }

  async changePassword(
    userId: string,
    organizationId: string,
    dto: ChangeCustomerPasswordDto,
    request: Request,
  ) {
    const user = await this.findOwnedUser(userId, organizationId);

    const isCurrentPasswordValid = await PasswordUtil.compare(
      dto.currentPassword,
      user.passwordHash,
    );
    if (!isCurrentPasswordValid) {
      throw new BadRequestException('Current password is incorrect');
    }

    const newPasswordHash = await PasswordUtil.hash(dto.newPassword);

    await (this.prisma as any).user.update({
      where: { id: user.id },
      data: { passwordHash: newPasswordHash },
    });

    await this.auditLogService.record({
      organizationId,
      actorId: user.id,
      actorEmail: user.email,
      actorName: `${user.firstName} ${user.lastName}`,
      action: AUDIT_ACTIONS.PASSWORD_CHANGED,
      entityType: 'User',
      entityId: user.id,
      request,
    });

    return null;
  }

  async updatePreferences(
    userId: string,
    organizationId: string,
    dto: UpdatePreferencesDto,
  ) {
    const user = await this.findOwnedUser(userId, organizationId);

    const userData: Record<string, unknown> = {};
    if (dto.language !== undefined) userData.locale = dto.language;
    if (dto.timezone !== undefined) userData.timezone = dto.timezone;
    if (dto.darkMode !== undefined) userData.darkMode = dto.darkMode;

    if (Object.keys(userData).length > 0) {
      await (this.prisma as any).user.update({
        where: { id: user.id },
        data: userData,
      });
    }

    if (dto.notificationPreferences?.length) {
      for (const pref of dto.notificationPreferences) {
        await (this.prisma as any).notificationPreference.upsert({
          where: {
            userId_organizationId_type_channel: {
              userId: user.id,
              organizationId,
              type: pref.type,
              channel: pref.channel,
            },
          },
          update: { enabled: pref.enabled },
          create: {
            userId: user.id,
            organizationId,
            type: pref.type,
            channel: pref.channel,
            enabled: pref.enabled,
          },
        });
      }
    }

    return {
      language: dto.language ?? user.locale,
      timezone: dto.timezone ?? user.timezone,
      darkMode: dto.darkMode ?? user.darkMode,
      notificationPreferences:
        dto.notificationPreferences ??
        (await (this.prisma as any).notificationPreference.findMany({
          where: { userId: user.id, organizationId },
          select: { type: true, channel: true, enabled: true },
        })),
    };
  }

  async uploadAvatar(
    userId: string,
    organizationId: string,
    file: UploadedFile,
    request: Request,
  ) {
    if (!file?.buffer) {
      throw new BadRequestException('An avatar file is required');
    }

    if (!ALLOWED_AVATAR_MIME_TYPES.includes(file.mimetype)) {
      throw new BadRequestException(
        'Unsupported file type. Allowed types: png, jpeg, webp, gif.',
      );
    }

    if (file.size > MAX_AVATAR_SIZE_BYTES) {
      throw new BadRequestException('Avatar image must not exceed 5MB');
    }

    const user = await this.findOwnedUser(userId, organizationId);

    const extension =
      extname(file.originalname) || `.${file.mimetype.split('/')[1] ?? 'png'}`;
    const filename = `${randomUUID()}${extension}`;
    const path = `avatars/${organizationId}/${userId}/${filename}`;
    const bucket =
      this.configService.get<string>('supabase.bucket') ?? 'supportflow';

    const { error } = await this.storageService.uploadFile(
      bucket,
      path,
      file.buffer,
      file.mimetype,
    );
    if (error) {
      throw new BadRequestException(`Avatar upload failed: ${error.message}`);
    }

    const publicUrl = this.storageService.getPublicUrl(bucket, path);

    const updatedUser = await (this.prisma as any).user.update({
      where: { id: user.id },
      data: { avatarUrl: publicUrl },
    });

    await (this.prisma as any).fileUpload.create({
      data: {
        organizationId,
        uploadedById: user.id,
        originalName: file.originalname,
        storedName: filename,
        mimeType: file.mimetype,
        fileSize: BigInt(file.size),
        bucket,
        path,
        publicUrl,
        fileType: 'IMAGE',
        isPublic: true,
      },
    });

    await this.auditLogService.record({
      organizationId,
      actorId: user.id,
      actorEmail: user.email,
      actorName: `${user.firstName} ${user.lastName}`,
      action: AUDIT_ACTIONS.AVATAR_UPDATE,
      entityType: 'User',
      entityId: user.id,
      metadata: { path, url: publicUrl },
      request,
    });

    return { avatarUrl: updatedUser.avatarUrl };
  }

  private async findOwnedUser(userId: string, organizationId: string) {
    const user = await (this.prisma as any).user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.organizationId !== organizationId) {
      throw new UnauthorizedException('You do not belong to this organization');
    }

    return user;
  }
}
