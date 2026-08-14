import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  AuditLogService,
  AUDIT_ACTIONS,
} from '../../audit-log/audit-log.service';
import { SubscriptionAccess } from '../enums/subscription.enums';
import { CreatePlanDto } from '../dto/create-plan.dto';
import { UpdatePlanDto } from '../dto/update-plan.dto';

@Injectable()
export class PlanService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
  ) {}

  /** All tenants can read plans (staff). Customers have no subscription access. */
  list(includeInactive = false) {
    return (this.prisma as any).subscriptionPlan.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { priceMonthly: 'asc' }],
    });
  }

  async getById(id: string) {
    const plan = await (this.prisma as any).subscriptionPlan.findUnique({
      where: { id },
    });
    if (!plan) {
      throw new NotFoundException('Plan not found');
    }
    return plan;
  }

  async create(dto: CreatePlanDto, access: SubscriptionAccess) {
    this.assertPlatformAdmin(access);
    await this.assertUniqueCode(dto.code);

    const plan = await (this.prisma as any).subscriptionPlan.create({
      data: {
        code: dto.code,
        name: dto.name,
        description: dto.description,
        // Prisma model field is `type` (the DTO calls it `planType`).
        type: dto.planType ?? 'FREE',
        priceMonthly: dto.priceMonthly ?? 0,
        priceYearly: dto.priceYearly ?? 0,
        currency: dto.currency ?? 'USD',
        isActive: dto.isActive ?? true,
        sortOrder: dto.sortOrder ?? 0,
        trialDays: dto.trialDays ?? 14,
        maxUsers: dto.maxUsers ?? 0,
        maxCustomers: dto.maxCustomers ?? 0,
        maxAgents: dto.maxAgents ?? 0,
        maxTicketsPerMonth: dto.maxTicketsPerMonth ?? 0,
        maxFeedbackForms: dto.maxFeedbackForms ?? 0,
        maxAttachmentsPerTicket: dto.maxAttachmentsPerTicket ?? 5,
        maxKnowledgeArticles: dto.maxKnowledgeArticles ?? 0,
        maxInvitations: dto.maxInvitations ?? 0,
        storageLimitBytes: dto.storageLimitBytes
          ? BigInt(dto.storageLimitBytes)
          : 0n,
        apiMonthlyQuota: dto.apiMonthlyQuota ?? 0,
        features: dto.features ?? {},
      },
    });

    await this.auditLogService.record({
      actorId: access.userId,
      actorEmail: access.email,
      action: AUDIT_ACTIONS.PLAN_CREATED,
      entityType: 'SubscriptionPlan',
      entityId: plan.id,
      metadata: { code: plan.code },
    });

    return plan;
  }

  async update(id: string, dto: UpdatePlanDto, access: SubscriptionAccess) {
    this.assertPlatformAdmin(access);

    const existing = await (this.prisma as any).subscriptionPlan.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException('Plan not found');
    }

    const data: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(dto)) {
      if (value === undefined) continue;
      if (key === 'storageLimitBytes') {
        data[key] = BigInt(value as number);
      } else if (key === 'planType') {
        // Prisma model field is `type` (the DTO calls it `planType`).
        data.type = value;
      } else {
        data[key] = value;
      }
    }

    const plan = await (this.prisma as any).subscriptionPlan.update({
      where: { id },
      data,
    });

    await this.auditLogService.record({
      actorId: access.userId,
      actorEmail: access.email,
      action: AUDIT_ACTIONS.PLAN_UPDATED,
      entityType: 'SubscriptionPlan',
      entityId: plan.id,
      metadata: { code: plan.code, changes: dto },
    });

    return plan;
  }

  async remove(id: string, access: SubscriptionAccess) {
    this.assertPlatformAdmin(access);

    const existing = await (this.prisma as any).subscriptionPlan.findUnique({
      where: { id },
      include: { subscriptions: { take: 1, select: { id: true } } },
    });
    if (!existing) {
      throw new NotFoundException('Plan not found');
    }

    if (existing.subscriptions.length > 0) {
      // Plans referenced by history cannot be deleted; deactivate instead.
      const plan = await (this.prisma as any).subscriptionPlan.update({
        where: { id },
        data: { isActive: false },
      });
      await this.auditLogService.record({
        actorId: access.userId,
        actorEmail: access.email,
        action: AUDIT_ACTIONS.PLAN_UPDATED,
        entityType: 'SubscriptionPlan',
        entityId: plan.id,
        metadata: { code: plan.code, deactivated: true },
      });
      return {
        message: 'Plan deactivated (it is referenced by subscriptions).',
      };
    }

    await (this.prisma as any).subscriptionPlan.delete({ where: { id } });
    await this.auditLogService.record({
      actorId: access.userId,
      actorEmail: access.email,
      action: AUDIT_ACTIONS.PLAN_UPDATED,
      entityType: 'SubscriptionPlan',
      entityId: id,
      metadata: { code: existing.code, deleted: true },
    });

    return { message: 'Plan deleted.' };
  }

  private async assertUniqueCode(code: string) {
    const existing = await (this.prisma as any).subscriptionPlan.findUnique({
      where: { code },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException(`A plan with code "${code}" already exists`);
    }
  }

  private assertPlatformAdmin(access: SubscriptionAccess) {
    if (!access.isPlatformAdmin) {
      throw new ForbiddenException(
        'Only platform administrators can manage subscription plans.',
      );
    }
  }
}
