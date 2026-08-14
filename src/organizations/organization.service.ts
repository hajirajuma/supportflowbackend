import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { extname } from 'path';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { SupabaseStorageService } from '../storage/supabase.storage.service';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { UploadedFile } from './dto/upload-logo.dto';

const ALLOWED_LOGO_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/svg+xml',
];
const MAX_LOGO_SIZE_BYTES = 2 * 1024 * 1024; // 2MB

const LANGUAGE_ENUMS = [
  'EN',
  'ES',
  'FR',
  'DE',
  'IT',
  'PT',
  'NL',
  'RU',
  'ZH',
  'JA',
  'KO',
  'AR',
  'HI',
];

@Injectable()
export class OrganizationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: SupabaseStorageService,
    private readonly configService: ConfigService,
  ) {}

  async getOrganization(organizationId: string) {
    const [organization, settings] = await Promise.all([
      (this.prisma as any).organization.findUnique({
        where: { id: organizationId },
      }),
      (this.prisma as any).organizationSettings.findUnique({
        where: { organizationId },
      }),
    ]);

    if (!organization) {
      throw new NotFoundException('Organization not found');
    }

    const metadata = organization.metadata ?? {};
    const language = settings?.defaultLanguage ?? organization.locale ?? 'EN';

    return {
      success: true,
      message: 'Organization retrieved successfully',
      data: {
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
        logo: organization.logo ?? null,
        favicon: settings?.brandFavicon ?? null,
        description: metadata.description ?? null,
        contactEmail: settings?.supportEmail ?? organization.billingEmail ?? '',
        contactPhone: settings?.supportPhone ?? null,
        website: organization.website ?? null,
        address: metadata.address ?? null,
        timezone: settings?.timezone ?? organization.timezone ?? 'UTC',
        language,
        primaryColor: settings?.primaryColor ?? '#3B82F6',
        secondaryColor: settings?.secondaryColor ?? '#6366F1',
        brandName: settings?.portalTitle ?? organization.name,
        plan: 'free',
        status: (organization.status ?? 'ACTIVE').toLowerCase(),
        storageUsed: 0,
        storageLimit: 0,
        createdAt: organization.createdAt,
        updatedAt: organization.updatedAt,
      },
    };
  }

  async updateOrganization(organizationId: string, dto: UpdateOrganizationDto) {
    const organization = await (this.prisma as any).organization.findUnique({
      where: { id: organizationId },
    });

    if (!organization) {
      throw new NotFoundException('Organization not found');
    }

    const metadata = {
      ...(organization.metadata ?? {}),
      ...(dto.description !== undefined
        ? { description: dto.description }
        : {}),
      ...(dto.address !== undefined ? { address: dto.address } : {}),
    };

    const language = dto.language ?? organization.locale ?? 'EN';
    const supportEmail = dto.contactEmail ?? dto.supportEmail;
    const supportPhone = dto.contactPhone ?? dto.supportPhone;
    const settingsData: any = {
      ...(supportEmail !== undefined ? { supportEmail } : {}),
      ...(supportPhone !== undefined ? { supportPhone } : {}),
      ...(dto.timezone !== undefined ? { timezone: dto.timezone } : {}),
    };
    // defaultLanguage is an enum column — only write when the value matches.
    if (LANGUAGE_ENUMS.includes(String(language).toUpperCase())) {
      settingsData.defaultLanguage = String(language).toUpperCase();
    }

    const updatedOrganization = await (this.prisma as any).organization.update({
      where: { id: organizationId },
      data: {
        name: dto.name ?? organization.name,
        website: dto.website ?? organization.website,
        timezone: dto.timezone ?? organization.timezone,
        locale: language,
        metadata,
      },
    });

    await (this.prisma as any).organizationSettings.upsert({
      where: { organizationId },
      create: { organizationId, ...settingsData },
      update: settingsData,
    });

    return {
      success: true,
      message: 'Organization updated successfully',
      data: updatedOrganization,
    };
  }

  async uploadLogo(organizationId: string, userId: string, file: UploadedFile) {
    const publicUrl = await this.uploadImage(
      organizationId,
      userId,
      file,
      'logos',
    );

    const updated = await (this.prisma as any).organization.update({
      where: { id: organizationId },
      data: { logo: publicUrl },
    });

    return {
      success: true,
      message: 'Logo uploaded successfully',
      data: { url: publicUrl, logo: updated.logo },
    };
  }

  async uploadFavicon(
    organizationId: string,
    userId: string,
    file: UploadedFile,
  ) {
    const publicUrl = await this.uploadImage(
      organizationId,
      userId,
      file,
      'favicons',
    );

    await (this.prisma as any).organizationSettings.upsert({
      where: { organizationId },
      create: { organizationId, brandFavicon: publicUrl },
      update: { brandFavicon: publicUrl },
    });

    return {
      success: true,
      message: 'Favicon uploaded successfully',
      data: { url: publicUrl },
    };
  }

  private async uploadImage(
    organizationId: string,
    userId: string,
    file: UploadedFile,
    folder: 'logos' | 'favicons',
  ): Promise<string> {
    if (!file?.buffer) {
      throw new BadRequestException('An image file is required');
    }

    if (!ALLOWED_LOGO_MIME_TYPES.includes(file.mimetype)) {
      throw new BadRequestException(
        'Unsupported file type. Allowed types: png, jpeg, webp, svg.',
      );
    }

    if (file.size > MAX_LOGO_SIZE_BYTES) {
      throw new BadRequestException('Image must not exceed 2MB');
    }

    const extension =
      extname(file.originalname) || `.${file.mimetype.split('/')[1] ?? 'png'}`;
    const filename = `${randomUUID()}${extension}`;
    const path = `${folder}/${organizationId}/${filename}`;
    const bucket =
      this.configService.get<string>('supabase.bucket') ?? 'supportflow';

    const { error } = await this.storageService.uploadFile(
      bucket,
      path,
      file.buffer,
      file.mimetype,
    );
    if (error) {
      throw new BadRequestException(`Upload failed: ${error.message}`);
    }

    // Record the upload for audit trail / file management.
    await (this.prisma as any).fileUpload
      .create({
        data: {
          organizationId,
          uploadedById: userId,
          originalName: file.originalname,
          storedName: filename,
          mimeType: file.mimetype,
          fileSize: BigInt(file.size),
          fileType: 'IMAGE',
          bucket,
          path,
          publicUrl: this.storageService.getPublicUrl(bucket, path),
          isPublic: true,
        },
      })
      .catch(() => null);

    return this.storageService.getPublicUrl(bucket, path);
  }

  async ensureOrganizationOwnership(userId: string, organizationId: string) {
    const user = await (this.prisma as any).user.findUnique({
      where: { id: userId },
      select: { organizationId: true, role: true },
    });

    if (!user || user.organizationId !== organizationId) {
      throw new ForbiddenException('You do not belong to this organization');
    }

    if (user.role !== 'TENANT_OWNER') {
      throw new ForbiddenException(
        'Only tenant owners can manage organization settings and members',
      );
    }
  }

  listMembers(organizationId: string) {
    return (this.prisma as any).user.findMany({
      where: {
        organizationId,
        deletedAt: null,
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        status: true,
        createdAt: true,
      },
    });
  }
}
