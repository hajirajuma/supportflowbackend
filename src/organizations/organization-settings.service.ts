import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateOrganizationSettingsDto } from './dto/update-organization-settings.dto';

@Injectable()
export class OrganizationSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async getSettings(organizationId: string) {
    const settings = await (this.prisma as any).organizationSettings.findUnique(
      {
        where: { organizationId },
      },
    );

    if (!settings) {
      throw new NotFoundException('Organization settings not found');
    }

    return {
      success: true,
      message: 'Organization settings retrieved successfully',
      data: settings,
    };
  }

  async updateSettings(
    organizationId: string,
    dto: UpdateOrganizationSettingsDto,
  ) {
    const existing = await (this.prisma as any).organizationSettings.findUnique(
      {
        where: { organizationId },
      },
    );

    const settings = existing
      ? await (this.prisma as any).organizationSettings.update({
          where: { organizationId },
          data: {
            ...dto,
            metadata: {
              ...(existing.metadata ?? {}),
              portalTitle: dto.portalTitle,
              supportEmail: dto.supportEmail,
              supportPhone: dto.supportPhone,
            },
          },
        })
      : await (this.prisma as any).organizationSettings.create({
          data: {
            organizationId,
            ...dto,
          },
        });

    return {
      success: true,
      message: 'Organization settings updated successfully',
      data: settings,
    };
  }
}
