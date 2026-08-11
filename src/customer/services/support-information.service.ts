import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class SupportInformationService {
  constructor(private readonly prisma: PrismaService) {}

  async getSupportInformation(organizationId: string) {
    const [organization, settings] = await Promise.all([
      (this.prisma as any).organization.findUnique({
        where: { id: organizationId },
        select: {
          id: true,
          name: true,
          website: true,
          timezone: true,
          locale: true,
        },
      }),
      (this.prisma as any).organizationSettings.findUnique({
        where: { organizationId },
        select: {
          supportEmail: true,
          supportPhone: true,
        },
      }),
    ]);

    return {
      organizationName: organization?.name ?? null,
      supportEmail: settings?.supportEmail ?? null,
      supportPhone: settings?.supportPhone ?? null,
      businessHours: null,
      officeAddress: null,
      website: organization?.website ?? null,
      timezone: organization?.timezone ?? 'UTC',
      locale: organization?.locale ?? 'en-US',
    };
  }
}
