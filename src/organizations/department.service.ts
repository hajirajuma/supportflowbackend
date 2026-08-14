import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDepartmentDto } from './dto/create-department.dto';
import { UpdateDepartmentDto } from './dto/update-department.dto';

@Injectable()
export class DepartmentService {
  constructor(private readonly prisma: PrismaService) {}

  async listDepartments(organizationId: string) {
    const departments = await (this.prisma as any).department.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'asc' },
      include: {
        members: {
          select: {
            isManager: true,
            user: {
              select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
                role: true,
                status: true,
                avatarUrl: true,
              },
            },
          },
        },
        _count: {
          select: { tickets: true },
        },
      },
    });

    const mapped = departments.map((department: any) => ({
      id: department.id,
      name: department.name,
      description: department.description,
      isActive: department.isActive,
      createdAt: department.createdAt,
      updatedAt: department.updatedAt,
      ticketCount: department._count.tickets,
      head: department.members.find((m: any) => m.isManager)?.user ?? null,
      members: department.members.map((m: any) => ({
        id: m.user.id,
        user: m.user,
        role: m.user.role,
        isManager: m.isManager,
        joinedAt: m.joinedAt,
      })),
    }));

    return {
      success: true,
      message: 'Departments retrieved successfully',
      data: mapped,
    };
  }

  async getDepartment(organizationId: string, departmentId: string) {
    const department = await (this.prisma as any).department.findFirst({
      where: { id: departmentId, organizationId },
    });

    if (!department) {
      throw new NotFoundException('Department not found');
    }

    return {
      success: true,
      message: 'Department retrieved successfully',
      data: department,
    };
  }

  async createDepartment(organizationId: string, dto: CreateDepartmentDto) {
    const existing = await (this.prisma as any).department.findFirst({
      where: { organizationId, name: dto.name },
    });

    if (existing) {
      throw new BadRequestException(
        `A department named "${dto.name}" already exists`,
      );
    }

    const department = await (this.prisma as any).department.create({
      data: {
        organizationId,
        name: dto.name,
        description: dto.description ?? null,
      },
    });

    return {
      success: true,
      message: 'Department created successfully',
      data: department,
    };
  }

  async updateDepartment(
    organizationId: string,
    departmentId: string,
    dto: UpdateDepartmentDto,
  ) {
    const department = await (this.prisma as any).department.findFirst({
      where: { id: departmentId, organizationId },
    });

    if (!department) {
      throw new NotFoundException('Department not found');
    }

    if (dto.name && dto.name !== department.name) {
      const existing = await (this.prisma as any).department.findFirst({
        where: { organizationId, name: dto.name },
      });
      if (existing) {
        throw new BadRequestException(
          `A department named "${dto.name}" already exists`,
        );
      }
    }

    const updated = await (this.prisma as any).department.update({
      where: { id: departmentId },
      data: {
        name: dto.name ?? department.name,
        description: dto.description ?? department.description,
      },
    });

    return {
      success: true,
      message: 'Department updated successfully',
      data: updated,
    };
  }

  async deleteDepartment(organizationId: string, departmentId: string) {
    const department = await (this.prisma as any).department.findFirst({
      where: { id: departmentId, organizationId },
    });

    if (!department) {
      throw new NotFoundException('Department not found');
    }

    await (this.prisma as any).department.delete({
      where: { id: departmentId },
    });

    return {
      success: true,
      message: 'Department deleted successfully',
      data: null,
    };
  }
}
