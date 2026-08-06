import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class BrandingService {
  constructor(private readonly prisma: PrismaService) {}

  async getBranding(organizationId: string) {
    const settings = await (this.prisma as any).organizationSettings.findUnique(
      {
        where: { organizationId },
      },
    );

    if (!settings) {
      throw new NotFoundException('Organization branding not found');
    }

    return {
      success: true,
      message: 'Organization branding retrieved successfully',
      data: {
        primaryColor: settings.primaryColor,
        accentColor: settings.secondaryColor,
        logoUrl: settings.brandLogo ?? settings.portalLogo ?? null,
      },
    };
  }

  async updateBranding(
    organizationId: string,
    data: { primaryColor?: string; accentColor?: string; logoUrl?: string },
  ) {
    const settings = await (this.prisma as any).organizationSettings.upsert({
      where: { organizationId },
      update: {
        primaryColor: data.primaryColor,
        secondaryColor: data.accentColor,
        brandLogo: data.logoUrl,
      },
      create: {
        organizationId,
        primaryColor: data.primaryColor,
        secondaryColor: data.accentColor,
        brandLogo: data.logoUrl,
      },
    });

    return {
      success: true,
      message: 'Organization branding updated successfully',
      data: settings,
    };
  }
}
