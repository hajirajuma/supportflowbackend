import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateMemberRoleDto } from './dto/update-member-role.dto';
import { SuspendMemberDto } from './dto/suspend-member.dto';

@Injectable()
export class MemberService {
  constructor(private readonly prisma: PrismaService) {}

  async listMembers(
    organizationId: string,
    filters: { search?: string; role?: string; status?: string },
  ) {
    const where: any = {
      organizationId,
      deactivatedAt: null,
    };

    if (filters.search) {
      where.OR = [
        { email: { contains: filters.search, mode: 'insensitive' } },
        { firstName: { contains: filters.search, mode: 'insensitive' } },
        { lastName: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    if (filters.role) {
      where.role = filters.role;
    }

    if (filters.status) {
      where.status = filters.status;
    }

    const members = await (this.prisma as any).user.findMany({
      where,
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

    return {
      success: true,
      message: 'Organization members retrieved successfully',
      data: members,
    };
  }

  async getMember(organizationId: string, memberId: string) {
    const member = await (this.prisma as any).user.findFirst({
      where: {
        id: memberId,
        organizationId,
        deactivatedAt: null,
      },
    });

    if (!member) {
      throw new NotFoundException('Member not found');
    }

    return {
      success: true,
      message: 'Member retrieved successfully',
      data: member,
    };
  }

  async updateMember(
    organizationId: string,
    memberId: string,
    dto: UpdateMemberRoleDto,
  ) {
    const member = await (this.prisma as any).user.findFirst({
      where: {
        id: memberId,
        organizationId,
        deactivatedAt: null,
      },
    });

    if (!member) {
      throw new NotFoundException('Member not found');
    }

    const updatedMember = await (this.prisma as any).user.update({
      where: { id: memberId },
      data: {
        role: dto.role,
        status: dto.status ?? member.status,
      },
    });

    return {
      success: true,
      message: 'Member updated successfully',
      data: updatedMember,
    };
  }

  async removeMember(organizationId: string, memberId: string) {
    const member = await (this.prisma as any).user.findFirst({
      where: { id: memberId, organizationId, deactivatedAt: null },
    });

    if (!member) {
      throw new NotFoundException('Member not found');
    }

    await (this.prisma as any).user.update({
      where: { id: memberId },
      data: {
        deactivatedAt: new Date(),
        status: 'INACTIVE',
        organizationId: null,
      },
    });

    return {
      success: true,
      message: 'Member removed successfully',
      data: null,
    };
  }

  async suspendMember(
    organizationId: string,
    memberId: string,
    dto: SuspendMemberDto,
  ) {
    const member = await (this.prisma as any).user.findFirst({
      where: { id: memberId, organizationId, deactivatedAt: null },
    });

    if (!member) {
      throw new NotFoundException('Member not found');
    }

    await (this.prisma as any).user.update({
      where: { id: memberId },
      data: { status: dto.status },
    });

    return {
      success: true,
      message: 'Member status updated successfully',
      data: null,
    };
  }
}
