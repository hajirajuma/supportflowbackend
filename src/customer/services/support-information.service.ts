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
          email: true,
          phone: true,
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
          businessHours: true,
        },
      }),
    ]);

    return {
      organizationName: organization?.name ?? null,
      supportEmail: settings?.supportEmail ?? organization?.email ?? null,
      supportPhone: settings?.supportPhone ?? organization?.phone ?? null,
      businessHours: settings?.businessHours ?? null,
      officeAddress: null,
      website: organization?.website ?? null,
      timezone: organization?.timezone ?? 'UTC',
      locale: organization?.locale ?? 'en-US',
    };
  }
}
