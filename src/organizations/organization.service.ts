import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateOrganizationDto } from './dto/update-organization.dto';

@Injectable()
export class OrganizationService {
  constructor(private readonly prisma: PrismaService) {}

  async getOrganization(organizationId: string) {
    const organization = await (this.prisma as any).organization.findUnique({
      where: { id: organizationId },
    });

    if (!organization) {
      throw new NotFoundException('Organization not found');
    }

    return {
      success: true,
      message: 'Organization retrieved successfully',
      data: organization,
    };
  }

  async updateOrganization(organizationId: string, dto: UpdateOrganizationDto) {
    const organization = await (this.prisma as any).organization.findUnique({
      where: { id: organizationId },
    });

    if (!organization) {
      throw new NotFoundException('Organization not found');
    }

    const updatedOrganization = await (this.prisma as any).organization.update({
      where: { id: organizationId },
      data: {
        name: dto.name ?? organization.name,
        website: dto.website ?? organization.website,
        timezone: dto.timezone ?? organization.timezone,
        locale: dto.locale ?? organization.locale,
        email: dto.supportEmail ?? organization.email,
        phone: dto.supportPhone ?? organization.phone,
      },
    });

    return {
      success: true,
      message: 'Organization updated successfully',
      data: updatedOrganization,
    };
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
        deactivatedAt: null,
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
