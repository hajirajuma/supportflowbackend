import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService, AUDIT_ACTIONS } from '../audit-log/audit-log.service';
import { SlugUtil } from '../common/utils/slug.util';
import { PaginationUtil } from '../common/utils/pagination.util';
import { PasswordUtil } from '../common/utils/password.util';
import { PlatformAdminQueryDto } from './dto/platform-admin-query.dto';
import { CreatePlatformOrganizationDto } from './dto/create-platform-organization.dto';
import { UpdatePlatformOrganizationDto } from './dto/update-platform-organization.dto';
import { CreatePlatformUserDto } from './dto/create-platform-user.dto';
import { UpdatePlatformUserDto } from './dto/update-platform-user.dto';
import { UpdatePlatformSettingDto } from './dto/platform-admin-setting.dto';
import { TransferOrganizationOwnershipDto } from './dto/transfer-organization-ownership.dto';
import {
  UpdateSubdomainDto,
  ToggleSubdomainLockDto,
} from './dto/subdomain.dto';
import { CreatePlanDto } from '../subscriptions/dto/create-plan.dto';
import { UpdatePlanDto } from '../subscriptions/dto/update-plan.dto';
import {
  CreateAnnouncementDto,
  UpdateAnnouncementDto,
} from '../notifications/dto/announcement.dto';
import { KnowledgeBaseService } from '../customer/services/knowledge-base.service';
import type { DashboardAccess } from '../dashboard/types/dashboard-access.type';
import type { Request } from 'express';

type AdminAccess = DashboardAccess;

@Injectable()
export class PlatformAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
    private readonly knowledgeBaseService: KnowledgeBaseService,
  ) {}

  async getOverview(access: AdminAccess) {
    this.assertPlatformAdmin(access);

    const [
      organizations,
      users,
      subscriptions,
      tickets,
      knowledgeArticles,
      announcements,
      auditLogs,
      payments,
      latestOrganizations,
      latestUsers,
    ] = await Promise.all([
      (this.prisma as any).organization.count(),
      (this.prisma as any).user.count({
        where: { deletedAt: null },
      }),
      (this.prisma as any).organizationSubscription.count(),
      (this.prisma as any).ticket.count(),
      (this.prisma as any).knowledgeArticle.count(),
      (this.prisma as any).announcement.count(),
      (this.prisma as any).auditLog.count(),
      (this.prisma as any).payment.count(),
      (this.prisma as any).organization.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          slug: true,
          subdomain: true,
          status: true,
          createdAt: true,
        },
      }),
      (this.prisma as any).user.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          status: true,
          organizationId: true,
          createdAt: true,
        },
      }),
    ]);

    return {
      counts: {
        organizations,
        users,
        subscriptions,
        tickets,
        knowledgeArticles,
        announcements,
        auditLogs,
        payments,
      },
      recent: {
        organizations: latestOrganizations,
        users: latestUsers,
      },
      health: await this.getSystemHealth(),
    };
  }

  async listOrganizations(access: AdminAccess, query: PlatformAdminQueryDto) {
    this.assertPlatformAdmin(access);
    const page = PaginationUtil.normalizePage(query.page);
    const limit = PaginationUtil.normalizeLimit(query.limit);

    const where: any = {};
    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { slug: { contains: query.search, mode: 'insensitive' } },
        { subdomain: { contains: query.search, mode: 'insensitive' } },
      ];
    }
    if (query.status) {
      where.status = query.status;
    }

    const [items, total] = await Promise.all([
      (this.prisma as any).organization.findMany({
        where,
        orderBy: { [query.sortBy ?? 'createdAt']: query.sortOrder ?? 'desc' },
        skip: PaginationUtil.getSkip(page, limit),
        take: limit,
        include: {
          settings: true,
          subscriptions: {
            take: 1,
            orderBy: { createdAt: 'desc' },
            include: { plan: true },
          },
          users: {
            where: { role: 'TENANT_OWNER', deletedAt: null },
            take: 1,
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              avatarUrl: true,
            },
          },
          _count: {
            select: {
              users: true,
              tickets: true,
              knowledgeArticles: true,
            },
          },
        },
      }),
      (this.prisma as any).organization.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  async getOrganization(access: AdminAccess, id: string) {
    this.assertPlatformAdmin(access);
    const org = await (this.prisma as any).organization.findUnique({
      where: { id },
      include: {
        settings: true,
        users: {
          take: 10,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            role: true,
            status: true,
            createdAt: true,
          },
        },
        subscriptions: {
          include: { plan: true },
          orderBy: { createdAt: 'desc' },
          take: 3,
        },
      },
    });

    if (!org) {
      throw new NotFoundException('Organization not found');
    }

    return org;
  }

  async createOrganization(
    access: AdminAccess,
    dto: CreatePlatformOrganizationDto,
    request?: Request,
  ) {
    this.assertPlatformAdmin(access);
    const name = dto.name.trim();
    const slug = await this.ensureUniqueOrganizationSlug(
      dto.slug?.trim() || SlugUtil.create(name),
    );
    const subdomain = await this.ensureUniqueSubdomain(
      dto.subdomain?.trim() || slug,
    );
    const tenantKey = `${slug}-${randomUUID()}`;

    const organization = await (this.prisma as any).organization.create({
      data: {
        name,
        slug,
        subdomain,
        tenantKey,
        website: dto.website ?? null,
        timezone: dto.timezone ?? 'UTC',
        locale: dto.locale ?? 'en-US',
        status: dto.status ?? 'ACTIVE',
        logo: dto.logo ?? null,
        settings: {
          create: {
            defaultLanguage: 'EN',
            defaultTheme: 'LIGHT',
            timezone: dto.timezone ?? 'UTC',
            knowledgeBaseEnabled: true,
            supportEmail: dto.supportEmail ?? null,
            supportPhone: dto.supportPhone ?? null,
            portalTitle: name,
            portalLogo: dto.logo ?? null,
            brandLogo: dto.logo ?? null,
          },
        },
      },
    });

    await this.auditLogService.record({
      actorId: access.userId,
      actorEmail: access.email,
      action: AUDIT_ACTIONS.CREATE,
      entityType: 'Organization',
      entityId: organization.id,
      metadata: { name: organization.name, subdomain: organization.subdomain },
      request,
    });

    return organization;
  }

  async updateOrganization(
    access: AdminAccess,
    id: string,
    dto: UpdatePlatformOrganizationDto,
    request?: Request,
  ) {
    this.assertPlatformAdmin(access);
    const organization = await this.requireOrganization(id);
    const updated = await (this.prisma as any).organization.update({
      where: { id: organization.id },
      data: {
        name: dto.name ?? undefined,
        website: dto.website ?? undefined,
        timezone: dto.timezone ?? undefined,
        locale: dto.locale ?? undefined,
        logo: dto.logo ?? undefined,
        status: dto.status ?? undefined,
      },
    });

    await this.auditLogService.record({
      actorId: access.userId,
      actorEmail: access.email,
      action: AUDIT_ACTIONS.UPDATE,
      entityType: 'Organization',
      entityId: updated.id,
      metadata: { changes: dto },
      request,
    });

    return updated;
  }

  async suspendOrganization(
    access: AdminAccess,
    id: string,
    request?: Request,
  ) {
    return this.setOrganizationStatus(access, id, 'SUSPENDED', request);
  }

  async activateOrganization(
    access: AdminAccess,
    id: string,
    request?: Request,
  ) {
    return this.setOrganizationStatus(access, id, 'ACTIVE', request);
  }

  async archiveOrganization(
    access: AdminAccess,
    id: string,
    request?: Request,
  ) {
    return this.setOrganizationStatus(access, id, 'INACTIVE', request);
  }

  async restoreOrganization(
    access: AdminAccess,
    id: string,
    request?: Request,
  ) {
    return this.setOrganizationStatus(access, id, 'ACTIVE', request);
  }

  async transferOwnership(
    access: AdminAccess,
    organizationId: string,
    dto: TransferOrganizationOwnershipDto,
    request?: Request,
  ) {
    this.assertPlatformAdmin(access);
    const org = await this.requireOrganization(organizationId);
    const target = await (this.prisma as any).user.findFirst({
      where: { id: dto.userId, organizationId: org.id },
    });

    if (!target) {
      throw new NotFoundException('Target user not found in organization');
    }

    await (this.prisma as any).$transaction([
      (this.prisma as any).user.updateMany({
        where: { organizationId: org.id, role: 'TENANT_OWNER' },
        data: { role: 'SUPPORT_AGENT' },
      }),
      (this.prisma as any).user.update({
        where: { id: target.id },
        data: { role: 'TENANT_OWNER', status: 'ACTIVE' },
      }),
    ]);

    await this.auditLogService.record({
      actorId: access.userId,
      actorEmail: access.email,
      action: AUDIT_ACTIONS.ROLE_CHANGE,
      entityType: 'Organization',
      entityId: org.id,
      metadata: { userId: target.id, newRole: 'TENANT_OWNER' },
      request,
    });

    return { organizationId: org.id, ownerId: target.id };
  }

  async resetTenantSettings(access: AdminAccess, organizationId: string) {
    this.assertPlatformAdmin(access);
    const org = await this.requireOrganization(organizationId);
    await (this.prisma as any).organizationSettings.upsert({
      where: { organizationId: org.id },
      update: {
        defaultLanguage: 'EN',
        defaultTheme: 'LIGHT',
        timezone: org.timezone ?? 'UTC',
        dateFormat: 'MM/DD/YYYY',
        ticketAutoAssignment: false,
        ticketAutoCloseDays: 7,
        feedbackAutoRequest: true,
        notificationEmail: null,
        supportEmail: null,
        supportPhone: null,
        customCSS: null,
        customJS: null,
        allowPublicTickets: false,
        allowAnonymousFeedback: true,
        branding: null,
        portalTheme: 'default',
        portalLogo: null,
        portalFooter: null,
        knowledgeBaseEnabled: true,
        primaryColor: '#3B82F6',
        secondaryColor: '#6366F1',
        brandLogo: null,
        brandFavicon: null,
        emailBranding: null,
        portalTitle: org.name,
        customCss: null,
        metadata: {},
      },
      create: {
        organizationId: org.id,
        defaultLanguage: 'EN',
        defaultTheme: 'LIGHT',
        timezone: org.timezone ?? 'UTC',
        dateFormat: 'MM/DD/YYYY',
        ticketAutoAssignment: false,
        ticketAutoCloseDays: 7,
        feedbackAutoRequest: true,
        allowPublicTickets: false,
        allowAnonymousFeedback: true,
        portalTheme: 'default',
        knowledgeBaseEnabled: true,
        primaryColor: '#3B82F6',
        secondaryColor: '#6366F1',
        portalTitle: org.name,
      },
    });

    return { organizationId: org.id, reset: true };
  }

  async resetBranding(access: AdminAccess, organizationId: string) {
    this.assertPlatformAdmin(access);
    const org = await this.requireOrganization(organizationId);
    await (this.prisma as any).organization.update({
      where: { id: org.id },
      data: { logo: null },
    });
    await (this.prisma as any).organizationSettings.upsert({
      where: { organizationId: org.id },
      update: {
        primaryColor: '#3B82F6',
        secondaryColor: '#6366F1',
        portalLogo: null,
        brandLogo: null,
        brandFavicon: null,
      },
      create: {
        organizationId: org.id,
        primaryColor: '#3B82F6',
        secondaryColor: '#6366F1',
      },
    });
    return { organizationId: org.id, reset: true };
  }

  async organizationStats(access: AdminAccess, organizationId: string) {
    this.assertPlatformAdmin(access);
    const org = await this.requireOrganization(organizationId);
    const [users, tickets, subscriptions, knowledgeArticles, auditLogs] =
      await Promise.all([
        (this.prisma as any).user.count({
          where: { organizationId: org.id, deletedAt: null },
        }),
        (this.prisma as any).ticket.count({
          where: { organizationId: org.id },
        }),
        (this.prisma as any).organizationSubscription.count({
          where: { organizationId: org.id },
        }),
        (this.prisma as any).knowledgeArticle.count({
          where: { organizationId: org.id },
        }),
        (this.prisma as any).auditLog.count({
          where: { organizationId: org.id },
        }),
      ]);

    return {
      organizationId: org.id,
      users,
      tickets,
      subscriptions,
      knowledgeArticles,
      auditLogs,
    };
  }

  async organizationActivity(
    access: AdminAccess,
    organizationId: string,
    query: PlatformAdminQueryDto,
  ) {
    this.assertPlatformAdmin(access);
    const org = await this.requireOrganization(organizationId);
    const page = PaginationUtil.normalizePage(query.page);
    const limit = PaginationUtil.normalizeLimit(query.limit);
    const where: any = { organizationId: org.id };
    if (query.search) {
      where.OR = [
        { entityType: { contains: query.search, mode: 'insensitive' } },
        { entityId: { contains: query.search, mode: 'insensitive' } },
      ];
    }
    if (query.status) {
      where.action = query.status;
    }
    const [items, total] = await Promise.all([
      (this.prisma as any).auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: PaginationUtil.getSkip(page, limit),
        take: limit,
      }),
      (this.prisma as any).auditLog.count({ where }),
    ]);
    return { items, total, page, limit };
  }

  async listSubdomains(access: AdminAccess) {
    this.assertPlatformAdmin(access);
    return (this.prisma as any).organization.findMany({
      select: {
        id: true,
        name: true,
        slug: true,
        subdomain: true,
        customDomain: true,
        status: true,
        metadata: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async checkSubdomain(access: AdminAccess, value: string) {
    this.assertPlatformAdmin(access);
    const normalized = this.normalizeSubdomain(value);
    const existing = await (this.prisma as any).organization.findFirst({
      where: {
        OR: [
          { subdomain: normalized },
          { slug: normalized },
          { customDomain: value },
        ],
      },
      select: { id: true },
    });
    return { value: normalized, available: !existing };
  }

  async renameSubdomain(
    access: AdminAccess,
    organizationId: string,
    dto: UpdateSubdomainDto,
    request?: Request,
  ) {
    this.assertPlatformAdmin(access);
    const org = await this.requireOrganization(organizationId);
    const subdomain = await this.ensureUniqueSubdomain(dto.value, org.id);
    const updated = await (this.prisma as any).organization.update({
      where: { id: org.id },
      data: { subdomain },
    });
    await this.auditLogService.record({
      actorId: access.userId,
      actorEmail: access.email,
      action: AUDIT_ACTIONS.UPDATE,
      entityType: 'Organization',
      entityId: org.id,
      metadata: { subdomain },
      request,
    });
    return updated;
  }

  async lockSubdomain(
    access: AdminAccess,
    organizationId: string,
    dto: ToggleSubdomainLockDto = {},
    request?: Request,
  ) {
    return this.setSubdomainLock(access, organizationId, true, dto, request);
  }

  async releaseSubdomain(
    access: AdminAccess,
    organizationId: string,
    dto: ToggleSubdomainLockDto = {},
    request?: Request,
  ) {
    return this.setSubdomainLock(access, organizationId, false, dto, request);
  }

  async approveSubdomain(
    access: AdminAccess,
    organizationId: string,
    request?: Request,
  ) {
    return this.updateSubdomainState(
      access,
      organizationId,
      'APPROVED',
      request,
    );
  }

  async rejectSubdomain(
    access: AdminAccess,
    organizationId: string,
    request?: Request,
  ) {
    return this.updateSubdomainState(
      access,
      organizationId,
      'REJECTED',
      request,
    );
  }

  async listUsers(access: AdminAccess, query: PlatformAdminQueryDto) {
    this.assertPlatformAdmin(access);
    const page = PaginationUtil.normalizePage(query.page);
    const limit = PaginationUtil.normalizeLimit(query.limit);
    const where: any = {};
    if (query.search) {
      where.OR = [
        { email: { contains: query.search, mode: 'insensitive' } },
        { firstName: { contains: query.search, mode: 'insensitive' } },
        { lastName: { contains: query.search, mode: 'insensitive' } },
      ];
    }
    if (query.status) {
      where.status = query.status;
    }
    if (query.organizationId) {
      where.organizationId = query.organizationId;
    }

    const [items, total] = await Promise.all([
      (this.prisma as any).user.findMany({
        where,
        orderBy: { [query.sortBy ?? 'createdAt']: query.sortOrder ?? 'desc' },
        skip: PaginationUtil.getSkip(page, limit),
        take: limit,
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          status: true,
          organizationId: true,
          emailVerifiedAt: true,
          lastLoginAt: true,
          createdAt: true,
        },
      }),
      (this.prisma as any).user.count({ where }),
    ]);
    return { items, total, page, limit };
  }

  async createUser(
    access: AdminAccess,
    dto: CreatePlatformUserDto,
    request?: Request,
  ) {
    this.assertPlatformAdmin(access);
    const password = dto.password ?? randomUUID();
    const passwordHash = await PasswordUtil.hash(password, 12);
    const user = await (this.prisma as any).user.create({
      data: {
        email: dto.email,
        firstName: dto.firstName,
        lastName: dto.lastName,
        password: passwordHash,
        role: dto.role ?? 'CUSTOMER',
        status: 'ACTIVE',
        organizationId: dto.organizationId ?? null,
        emailVerifiedAt: new Date(),
      },
    });
    await this.auditLogService.record({
      actorId: access.userId,
      actorEmail: access.email,
      action: AUDIT_ACTIONS.CREATE,
      entityType: 'User',
      entityId: user.id,
      metadata: { role: user.role, organizationId: user.organizationId },
      request,
    });
    return { ...user, temporaryPassword: dto.password ? null : password };
  }

  async updateUser(
    access: AdminAccess,
    id: string,
    dto: UpdatePlatformUserDto,
    request?: Request,
  ) {
    this.assertPlatformAdmin(access);
    await this.requireUser(id);
    const data: any = {};
    if (dto.firstName !== undefined) data.firstName = dto.firstName;
    if (dto.lastName !== undefined) data.lastName = dto.lastName;
    if (dto.email !== undefined) data.email = dto.email;
    if (dto.role !== undefined) data.role = dto.role;
    if (dto.organizationId !== undefined)
      data.organizationId = dto.organizationId;
    const user = await (this.prisma as any).user.update({
      where: { id },
      data,
    });
    await this.auditLogService.record({
      actorId: access.userId,
      actorEmail: access.email,
      action: AUDIT_ACTIONS.UPDATE,
      entityType: 'User',
      entityId: user.id,
      metadata: { changes: dto },
      request,
    });
    return user;
  }

  async suspendUser(access: AdminAccess, id: string, request?: Request) {
    return this.setUserStatus(access, id, 'SUSPENDED', request);
  }

  async activateUser(access: AdminAccess, id: string, request?: Request) {
    return this.setUserStatus(access, id, 'ACTIVE', request);
  }

  async deleteUser(access: AdminAccess, id: string, request?: Request) {
    this.assertPlatformAdmin(access);
    const user = await this.requireUser(id);
    await (this.prisma as any).user.update({
      where: { id: user.id },
      data: {
        deletedAt: new Date(),
        deletedById: access.userId,
        status: 'INACTIVE',
      },
    });
    await this.forceLogout(access, id, request);
    return { deleted: true };
  }

  async resetUserPassword(
    access: AdminAccess,
    id: string,
    password: string,
    request?: Request,
  ) {
    this.assertPlatformAdmin(access);
    const user = await this.requireUser(id);
    const passwordHash = await PasswordUtil.hash(password, 12);
    await (this.prisma as any).user.update({
      where: { id: user.id },
      data: { password: passwordHash },
    });
    await this.forceLogout(access, id, request);
    return { userId: user.id, reset: true };
  }

  async forceLogout(access: AdminAccess, id: string, request?: Request) {
    this.assertPlatformAdmin(access);
    const user = await this.requireUser(id);
    await Promise.all([
      (this.prisma as any).refreshToken.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
      (this.prisma as any).userSession.updateMany({
        where: { userId: user.id, invalidatedAt: null },
        data: { invalidatedAt: new Date() },
      }),
    ]);
    await this.auditLogService.record({
      actorId: access.userId,
      actorEmail: access.email,
      action: AUDIT_ACTIONS.LOGOUT,
      entityType: 'User',
      entityId: user.id,
      metadata: { forced: true },
      request,
    });
    return { userId: user.id, revoked: true };
  }

  async verifyUserEmail(access: AdminAccess, id: string, request?: Request) {
    this.assertPlatformAdmin(access);
    const user = await this.requireUser(id);
    const updated = await (this.prisma as any).user.update({
      where: { id: user.id },
      data: { emailVerifiedAt: new Date(), status: 'ACTIVE' },
    });
    await this.auditLogService.record({
      actorId: access.userId,
      actorEmail: access.email,
      action: AUDIT_ACTIONS.EMAIL_VERIFIED,
      entityType: 'User',
      entityId: user.id,
      request,
    });
    return updated;
  }

  async listPlans(access: AdminAccess) {
    this.assertPlatformAdmin(access);
    return (this.prisma as any).subscriptionPlan.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async createPlan(access: AdminAccess, dto: CreatePlanDto, request?: Request) {
    this.assertPlatformAdmin(access);
    const plan = await (this.prisma as any).subscriptionPlan.create({
      data: {
        code: dto.code,
        name: dto.name,
        description: dto.description ?? null,
        planType: dto.planType ?? 'FREE',
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
        maxAttachmentsPerTicket: dto.maxAttachmentsPerTicket ?? 0,
        maxKnowledgeArticles: dto.maxKnowledgeArticles ?? 0,
        maxInvitations: dto.maxInvitations ?? 0,
        storageLimitBytes: BigInt(dto.storageLimitBytes ?? 0),
        apiRateLimitPerMinute: dto.apiRateLimitPerMinute ?? 0,
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
      request,
    });
    return plan;
  }

  async updatePlan(
    access: AdminAccess,
    id: string,
    dto: UpdatePlanDto,
    request?: Request,
  ) {
    this.assertPlatformAdmin(access);
    const plan = await (this.prisma as any).subscriptionPlan.update({
      where: { id },
      data: {
        ...dto,
        storageLimitBytes:
          dto.storageLimitBytes !== undefined
            ? BigInt(dto.storageLimitBytes)
            : undefined,
      },
    });
    await this.auditLogService.record({
      actorId: access.userId,
      actorEmail: access.email,
      action: AUDIT_ACTIONS.PLAN_UPDATED,
      entityType: 'SubscriptionPlan',
      entityId: plan.id,
      metadata: { code: plan.code, changes: dto },
      request,
    });
    return plan;
  }

  async deletePlan(access: AdminAccess, id: string, request?: Request) {
    this.assertPlatformAdmin(access);
    const existing = await (this.prisma as any).subscriptionPlan.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException('Plan not found');
    await (this.prisma as any).subscriptionPlan.update({
      where: { id },
      data: { isActive: false },
    });
    await this.auditLogService.record({
      actorId: access.userId,
      actorEmail: access.email,
      action: AUDIT_ACTIONS.PLAN_UPDATED,
      entityType: 'SubscriptionPlan',
      entityId: id,
      metadata: { deactivated: true },
      request,
    });
    return { deactivated: true };
  }

  async listSubscriptions(access: AdminAccess, query: PlatformAdminQueryDto) {
    this.assertPlatformAdmin(access);
    const page = PaginationUtil.normalizePage(query.page);
    const limit = PaginationUtil.normalizeLimit(query.limit);
    const where: any = {};
    if (query.organizationId) where.organizationId = query.organizationId;
    if (query.status) where.status = query.status;
    const [items, total] = await Promise.all([
      (this.prisma as any).organizationSubscription.findMany({
        where,
        include: { plan: true, organization: true },
        orderBy: { createdAt: 'desc' },
        skip: PaginationUtil.getSkip(page, limit),
        take: limit,
      }),
      (this.prisma as any).organizationSubscription.count({ where }),
    ]);
    return { items, total, page, limit };
  }

  async updateSubscription(
    access: AdminAccess,
    id: string,
    body: Record<string, any>,
    request?: Request,
  ) {
    this.assertPlatformAdmin(access);
    const updated = await (this.prisma as any).organizationSubscription.update({
      where: { id },
      data: body,
    });
    await this.auditLogService.record({
      actorId: access.userId,
      actorEmail: access.email,
      action: AUDIT_ACTIONS.SUBSCRIPTION_CHANGE,
      entityType: 'OrganizationSubscription',
      entityId: updated.id,
      metadata: { changes: body },
      request,
    });
    return updated;
  }

  async suspendSubscription(
    access: AdminAccess,
    id: string,
    request?: Request,
  ) {
    return this.updateSubscription(
      access,
      id,
      { status: 'SUSPENDED' },
      request,
    );
  }

  async renewSubscription(access: AdminAccess, id: string, request?: Request) {
    return this.updateSubscription(
      access,
      id,
      { status: 'ACTIVE', cancelledAt: null, cancelAt: null },
      request,
    );
  }

  async listPayments(access: AdminAccess, query: PlatformAdminQueryDto) {
    this.assertPlatformAdmin(access);
    const page = PaginationUtil.normalizePage(query.page);
    const limit = PaginationUtil.normalizeLimit(query.limit);
    const where: any = {};
    if (query.organizationId) where.organizationId = query.organizationId;
    if (query.status) where.status = query.status;
    const [items, total] = await Promise.all([
      (this.prisma as any).payment.findMany({
        where,
        include: {
          organization: { select: { id: true, name: true } },
          plan: true,
          subscription: true,
        },
        orderBy: { createdAt: 'desc' },
        skip: PaginationUtil.getSkip(page, limit),
        take: limit,
      }),
      (this.prisma as any).payment.count({ where }),
    ]);
    return { items, total, page, limit };
  }

  async paymentStats(access: AdminAccess) {
    this.assertPlatformAdmin(access);
    const [successful, failed, pending, revenue] = await Promise.all([
      (this.prisma as any).payment.count({ where: { status: 'SUCCESSFUL' } }),
      (this.prisma as any).payment.count({ where: { status: 'FAILED' } }),
      (this.prisma as any).payment.count({ where: { status: 'PENDING' } }),
      (this.prisma as any).payment.aggregate({
        where: { status: 'SUCCESSFUL' },
        _sum: { amount: true },
      }),
    ]);
    return {
      successful,
      failed,
      pending,
      revenue: Number(revenue?._sum?.amount ?? 0),
    };
  }

  async listTickets(access: AdminAccess, query: PlatformAdminQueryDto) {
    this.assertPlatformAdmin(access);
    const page = PaginationUtil.normalizePage(query.page);
    const limit = PaginationUtil.normalizeLimit(query.limit);
    const where: any = {};
    if (query.organizationId) where.organizationId = query.organizationId;
    if (query.status) where.status = query.status;
    if (query.search) {
      where.OR = [
        { subject: { contains: query.search, mode: 'insensitive' } },
        { ticketNumber: { contains: query.search, mode: 'insensitive' } },
      ];
    }
    const [items, total] = await Promise.all([
      (this.prisma as any).ticket.findMany({
        where,
        include: {
          organization: { select: { id: true, name: true, slug: true } },
          createdBy: {
            select: { id: true, email: true, firstName: true, lastName: true },
          },
          assignedTo: {
            select: { id: true, email: true, firstName: true, lastName: true },
          },
          feedback: true,
        },
        orderBy: { createdAt: 'desc' },
        skip: PaginationUtil.getSkip(page, limit),
        take: limit,
      }),
      (this.prisma as any).ticket.count({ where }),
    ]);
    return { items, total, page, limit };
  }

  async getTicket(access: AdminAccess, id: string) {
    this.assertPlatformAdmin(access);
    const ticket = await (this.prisma as any).ticket.findUnique({
      where: { id },
      include: {
        organization: true,
        createdBy: true,
        assignedTo: true,
        resolvedBy: true,
        closedBy: true,
        replies: { orderBy: { createdAt: 'asc' } },
        activities: { orderBy: { createdAt: 'desc' }, take: 20 },
        attachments: true,
        feedback: true,
      },
    });
    if (!ticket) throw new NotFoundException('Ticket not found');
    return ticket;
  }

  async forceCloseTicket(access: AdminAccess, id: string, request?: Request) {
    this.assertPlatformAdmin(access);
    const ticket = await this.getTicket(access, id);
    const updated = await (this.prisma as any).ticket.update({
      where: { id: ticket.id },
      data: {
        status: 'CLOSED',
        closedAt: new Date(),
        closedById: access.userId,
      },
    });
    await this.auditLogService.record({
      actorId: access.userId,
      actorEmail: access.email,
      action: AUDIT_ACTIONS.UPDATE,
      entityType: 'Ticket',
      entityId: ticket.id,
      metadata: { action: 'FORCE_CLOSE' },
      request,
    });
    return updated;
  }

  async restoreTicket(access: AdminAccess, id: string, request?: Request) {
    this.assertPlatformAdmin(access);
    const ticket = await (this.prisma as any).ticket.findUnique({
      where: { id },
    });
    if (!ticket) throw new NotFoundException('Ticket not found');
    const updated = await (this.prisma as any).ticket.update({
      where: { id },
      data: { deletedAt: null, deletedById: null },
    });
    await this.auditLogService.record({
      actorId: access.userId,
      actorEmail: access.email,
      action: AUDIT_ACTIONS.UPDATE,
      entityType: 'Ticket',
      entityId: id,
      metadata: { action: 'RESTORE_DELETED' },
      request,
    });
    return updated;
  }

  async listAnnouncements(access: AdminAccess, query: PlatformAdminQueryDto) {
    this.assertPlatformAdmin(access);
    const page = PaginationUtil.normalizePage(query.page);
    const limit = PaginationUtil.normalizeLimit(query.limit);
    const where: any = {};
    if (query.organizationId) where.organizationId = query.organizationId;
    if (query.search) {
      where.OR = [
        { title: { contains: query.search, mode: 'insensitive' } },
        { content: { contains: query.search, mode: 'insensitive' } },
      ];
    }
    const [items, total] = await Promise.all([
      (this.prisma as any).announcement.findMany({
        where,
        include: {
          createdBy: {
            select: { id: true, email: true, firstName: true, lastName: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: PaginationUtil.getSkip(page, limit),
        take: limit,
      }),
      (this.prisma as any).announcement.count({ where }),
    ]);
    return { items, total, page, limit };
  }

  async createAnnouncement(
    access: AdminAccess,
    dto: CreateAnnouncementDto,
    request?: Request,
  ) {
    this.assertPlatformAdmin(access);
    const announcement = await (this.prisma as any).announcement.create({
      data: {
        title: dto.title,
        content: dto.body,
        organizationId: null,
        isGlobal: true,
        startsAt: dto.scheduledAt ? new Date(dto.scheduledAt) : null,
        endsAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
        isActive: true,
        createdById: access.userId,
        metadata: {
          audience: dto.audience ?? null,
          priority: dto.priority ?? null,
          type: dto.type ?? null,
          audienceTarget: dto.audienceTarget ?? null,
        },
      },
    });
    await this.auditLogService.record({
      actorId: access.userId,
      actorEmail: access.email,
      action: AUDIT_ACTIONS.CREATE,
      entityType: 'Announcement',
      entityId: announcement.id,
      metadata: { title: announcement.title, isGlobal: true },
      request,
    });
    return announcement;
  }

  async updateAnnouncement(
    access: AdminAccess,
    id: string,
    dto: UpdateAnnouncementDto,
    request?: Request,
  ) {
    this.assertPlatformAdmin(access);
    const announcement = await this.requireAnnouncement(id);
    const updated = await (this.prisma as any).announcement.update({
      where: { id: announcement.id },
      data: {
        title: dto.title ?? undefined,
        content: dto.body ?? undefined,
        startsAt:
          dto.scheduledAt !== undefined
            ? dto.scheduledAt
              ? new Date(dto.scheduledAt)
              : null
            : undefined,
        endsAt:
          dto.expiresAt !== undefined
            ? dto.expiresAt
              ? new Date(dto.expiresAt)
              : null
            : undefined,
        metadata: {
          ...(announcement.metadata ?? {}),
          audience: dto.audience ?? undefined,
          priority: dto.priority ?? undefined,
          type: dto.type ?? undefined,
        },
      },
    });
    await this.auditLogService.record({
      actorId: access.userId,
      actorEmail: access.email,
      action: AUDIT_ACTIONS.UPDATE,
      entityType: 'Announcement',
      entityId: announcement.id,
      metadata: { changes: dto },
      request,
    });
    return updated;
  }

  async deleteAnnouncement(access: AdminAccess, id: string, request?: Request) {
    this.assertPlatformAdmin(access);
    const announcement = await this.requireAnnouncement(id);
    await (this.prisma as any).announcement.delete({
      where: { id: announcement.id },
    });
    await this.auditLogService.record({
      actorId: access.userId,
      actorEmail: access.email,
      action: AUDIT_ACTIONS.DELETE,
      entityType: 'Announcement',
      entityId: announcement.id,
      request,
    });
    return { deleted: true };
  }

  async publishAnnouncement(
    access: AdminAccess,
    id: string,
    request?: Request,
  ) {
    this.assertPlatformAdmin(access);
    const announcement = await this.requireAnnouncement(id);
    const updated = await (this.prisma as any).announcement.update({
      where: { id: announcement.id },
      data: {
        isActive: true,
        startsAt: announcement.startsAt ?? new Date(),
      },
    });
    await this.auditLogService.record({
      actorId: access.userId,
      actorEmail: access.email,
      action: AUDIT_ACTIONS.ANNOUNCEMENT_PUBLISHED,
      entityType: 'Announcement',
      entityId: announcement.id,
      request,
    });
    return updated;
  }

  async listKnowledgeCategories(access: AdminAccess, organizationId?: string) {
    this.assertPlatformAdmin(access);
    if (organizationId) {
      return this.knowledgeBaseService.getCategories(organizationId, true);
    }
    return (this.prisma as any).knowledgeCategory.findMany({
      include: {
        organization: { select: { id: true, name: true, slug: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async listKnowledgeArticles(
    access: AdminAccess,
    query: PlatformAdminQueryDto,
  ) {
    this.assertPlatformAdmin(access);
    if (query.organizationId) {
      return this.knowledgeBaseService.listArticles(
        query.organizationId,
        { ...query, search: query.search },
        true,
      );
    }
    const page = PaginationUtil.normalizePage(query.page);
    const limit = PaginationUtil.normalizeLimit(query.limit);
    const where: any = {};
    if (query.search) {
      where.OR = [
        { title: { contains: query.search, mode: 'insensitive' } },
        { excerpt: { contains: query.search, mode: 'insensitive' } },
        { content: { contains: query.search, mode: 'insensitive' } },
      ];
    }
    const [items, total] = await Promise.all([
      (this.prisma as any).knowledgeArticle.findMany({
        where,
        include: {
          organization: { select: { id: true, name: true, slug: true } },
          category: true,
        },
        orderBy: { createdAt: 'desc' },
        skip: PaginationUtil.getSkip(page, limit),
        take: limit,
      }),
      (this.prisma as any).knowledgeArticle.count({ where }),
    ]);
    return { items, total, page, limit };
  }

  async listAuditLogs(access: AdminAccess, query: PlatformAdminQueryDto) {
    this.assertPlatformAdmin(access);
    const page = PaginationUtil.normalizePage(query.page);
    const limit = PaginationUtil.normalizeLimit(query.limit);
    const where: any = {};
    if (query.organizationId) where.organizationId = query.organizationId;
    if (query.search) {
      where.OR = [
        { entityType: { contains: query.search, mode: 'insensitive' } },
        { entityId: { contains: query.search, mode: 'insensitive' } },
      ];
    }
    const [items, total] = await Promise.all([
      (this.prisma as any).auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: PaginationUtil.getSkip(page, limit),
        take: limit,
      }),
      (this.prisma as any).auditLog.count({ where }),
    ]);
    return { items, total, page, limit };
  }

  async listPlatformSettings(access: AdminAccess) {
    this.assertPlatformAdmin(access);
    return (this.prisma as any).systemSetting.findMany({
      orderBy: { key: 'asc' },
    });
  }

  async updatePlatformSetting(
    access: AdminAccess,
    dto: UpdatePlatformSettingDto,
    request?: Request,
  ) {
    this.assertPlatformAdmin(access);
    const setting = await (this.prisma as any).systemSetting.upsert({
      where: { key: dto.key },
      update: {
        value: dto.value,
        description: dto.description ?? undefined,
        isEncrypted: dto.isEncrypted ?? undefined,
      },
      create: {
        key: dto.key,
        value: dto.value,
        description: dto.description ?? null,
        isEncrypted: dto.isEncrypted ?? false,
      },
    });
    await this.auditLogService.record({
      actorId: access.userId,
      actorEmail: access.email,
      action: AUDIT_ACTIONS.UPDATE,
      entityType: 'SystemSetting',
      entityId: setting.id,
      metadata: { key: setting.key },
      request,
    });
    return setting;
  }

  async getSystemHealth() {
    const [organizations, users, tickets, audits, apiKeys, storageAgg] =
      await Promise.all([
        (this.prisma as any).organization.count(),
        (this.prisma as any).user.count(),
        (this.prisma as any).ticket.count(),
        (this.prisma as any).auditLog.count(),
        (this.prisma as any).apiKey.count(),
        (this.prisma as any).fileUpload.aggregate({
          _sum: { fileSize: true },
        }),
      ]);

    return {
      database: 'UP',
      redis: process.env.REDIS_URL ? 'CONFIGURED' : 'DISABLED',
      storage: process.env.SUPABASE_URL ? 'CONFIGURED' : 'MISSING',
      email: process.env.BREVO_API_KEY ? 'CONFIGURED' : 'MISSING',
      payChangu: process.env.PAYCHANGU_SECRET_KEY ? 'CONFIGURED' : 'MISSING',
      supabase: process.env.SUPABASE_URL ? 'CONFIGURED' : 'MISSING',
      queue: 'UNKNOWN',
      diskUsageBytes: Number(storageAgg?._sum?.fileSize ?? 0),
      counts: { organizations, users, tickets, audits, apiKeys },
    };
  }

  async listOrganizationUsers(access: AdminAccess, organizationId: string) {
    this.assertPlatformAdmin(access);
    const org = await this.requireOrganization(organizationId);
    return (this.prisma as any).user.findMany({
      where: { organizationId: org.id, deletedAt: null },
      orderBy: { createdAt: 'desc' },
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

  private async setOrganizationStatus(
    access: AdminAccess,
    id: string,
    status: string,
    request?: Request,
  ) {
    this.assertPlatformAdmin(access);
    const org = await this.requireOrganization(id);
    const updated = await (this.prisma as any).organization.update({
      where: { id: org.id },
      data: {
        status,
        deletedAt: status === 'ACTIVE' ? null : (org.deletedAt ?? null),
      },
    });
    await this.auditLogService.record({
      actorId: access.userId,
      actorEmail: access.email,
      action: AUDIT_ACTIONS.UPDATE,
      entityType: 'Organization',
      entityId: org.id,
      metadata: { status },
      request,
    });
    return updated;
  }

  private async setUserStatus(
    access: AdminAccess,
    id: string,
    status: string,
    request?: Request,
  ) {
    this.assertPlatformAdmin(access);
    const user = await this.requireUser(id);
    const updated = await (this.prisma as any).user.update({
      where: { id: user.id },
      data: { status },
    });
    await this.auditLogService.record({
      actorId: access.userId,
      actorEmail: access.email,
      action: AUDIT_ACTIONS.UPDATE,
      entityType: 'User',
      entityId: user.id,
      metadata: { status },
      request,
    });
    return updated;
  }

  private async setSubdomainLock(
    access: AdminAccess,
    organizationId: string,
    locked: boolean,
    dto: ToggleSubdomainLockDto,
    request?: Request,
  ) {
    const org = await this.requireOrganization(organizationId);
    const metadata = this.normalizeMetadata(org.metadata);
    metadata.subdomainLocked = dto.locked ?? locked;
    const updated = await (this.prisma as any).organization.update({
      where: { id: org.id },
      data: { metadata },
    });
    await this.auditLogService.record({
      actorId: access.userId,
      actorEmail: access.email,
      action: AUDIT_ACTIONS.UPDATE,
      entityType: 'Organization',
      entityId: org.id,
      metadata: { subdomainLocked: metadata.subdomainLocked },
      request,
    });
    return updated;
  }

  private async updateSubdomainState(
    access: AdminAccess,
    organizationId: string,
    state: string,
    request?: Request,
  ) {
    const org = await this.requireOrganization(organizationId);
    const metadata = this.normalizeMetadata(org.metadata);
    metadata.subdomainState = state;
    const updated = await (this.prisma as any).organization.update({
      where: { id: org.id },
      data: { metadata },
    });
    await this.auditLogService.record({
      actorId: access.userId,
      actorEmail: access.email,
      action: AUDIT_ACTIONS.UPDATE,
      entityType: 'Organization',
      entityId: org.id,
      metadata: { subdomainState: state },
      request,
    });
    return updated;
  }

  private async ensureUniqueOrganizationSlug(baseSlug: string) {
    const normalized = this.normalizeSubdomain(baseSlug);
    let candidate = normalized;
    let index = 1;
    while (
      await (this.prisma as any).organization.findUnique({
        where: { slug: candidate },
        select: { id: true },
      })
    ) {
      candidate = `${normalized}-${index}`;
      index += 1;
    }
    return candidate;
  }

  private async ensureUniqueSubdomain(
    baseSubdomain: string,
    excludeId?: string,
  ) {
    const normalized = this.normalizeSubdomain(baseSubdomain);
    let candidate = normalized;
    let index = 1;
    while (
      await (this.prisma as any).organization.findFirst({
        where: {
          subdomain: candidate,
          ...(excludeId ? { id: { not: excludeId } } : {}),
        },
        select: { id: true },
      })
    ) {
      candidate = `${normalized}-${index}`;
      index += 1;
    }
    return candidate;
  }

  private normalizeSubdomain(value: string) {
    return SlugUtil.create(value).replace(/^-+|-+$/g, '');
  }

  private normalizeMetadata(metadata: unknown): Record<string, any> {
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
      return {};
    }
    return { ...(metadata as Record<string, any>) };
  }

  private async requireOrganization(id: string) {
    const org = await (this.prisma as any).organization.findUnique({
      where: { id },
    });
    if (!org) throw new NotFoundException('Organization not found');
    return org;
  }

  private async requireUser(id: string) {
    const user = await (this.prisma as any).user.findUnique({
      where: { id },
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  private async requireAnnouncement(id: string) {
    const announcement = await (this.prisma as any).announcement.findUnique({
      where: { id },
    });
    if (!announcement) throw new NotFoundException('Announcement not found');
    return announcement;
  }

  private assertPlatformAdmin(access: AdminAccess) {
    if (!access.isPlatformAdmin) {
      throw new ForbiddenException(
        'Only platform administrators can access this resource.',
      );
    }
  }
}
