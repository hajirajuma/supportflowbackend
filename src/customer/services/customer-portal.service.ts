import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SupportInformationService } from './support-information.service';

@Injectable()
export class CustomerPortalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly supportInformationService: SupportInformationService,
  ) {}

  async getDashboard(userId: string, organizationId: string) {
    const [
      user,
      organization,
      recentTickets,
      ticketStats,
      recentNotifications,
      unreadNotificationCount,
      pendingFeedback,
      kbCategories,
      kbQuickLinks,
      support,
    ] = await Promise.all([
      this.getProfile(userId, organizationId),
      this.getOrganization(organizationId),
      (this.prisma as any).ticket.findMany({
        where: { organizationId, createdById: userId },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
          id: true,
          ticketNumber: true,
          subject: true,
          description: true,
          status: true,
          priority: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      this.getTicketStats(userId, organizationId),
      (this.prisma as any).notification.findMany({
        where: { userId, organizationId },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
          id: true,
          type: true,
          channel: true,
          title: true,
          body: true,
          isRead: true,
          createdAt: true,
        },
      }),
      (this.prisma as any).notification.count({
        where: { userId, organizationId, isRead: false },
      }),
      (this.prisma as any).feedbackForm.findMany({
        where: { organizationId, status: 'ACTIVE', isPublic: true },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
          id: true,
          title: true,
          description: true,
          welcomeMessage: true,
          thankYouMessage: true,
        },
      }),
      (this.prisma as any).knowledgeCategory.findMany({
        where: { organizationId, isActive: true },
        orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
        take: 5,
        select: {
          id: true,
          name: true,
          description: true,
          order: true,
          _count: {
            select: {
              articles: {
                where: { status: 'PUBLISHED', visibility: 'PUBLIC' },
              },
            },
          },
        },
      }),
      (this.prisma as any).knowledgeArticle.findMany({
        where: { organizationId, status: 'PUBLISHED', visibility: 'PUBLIC' },
        orderBy: { views: 'desc' },
        take: 5,
        select: {
          id: true,
          title: true,
          slug: true,
          excerpt: true,
          views: true,
          helpfulCount: true,
          publishedAt: true,
          category: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      }),
      this.supportInformationService.getSupportInformation(organizationId),
    ]);

    return {
      profile: user,
      organization,
      recentTickets,
      ticketStats,
      recentNotifications,
      unreadNotificationCount,
      pendingFeedbackRequests: pendingFeedback,
      knowledgeBase: {
        categories: kbCategories.map((category: any) => ({
          ...category,
          slug: this.slugify(category.name),
        })),
        quickLinks: kbQuickLinks,
      },
      supportContact: support,
    };
  }

  private async getProfile(userId: string, organizationId: string) {
    const user = await (this.prisma as any).user.findFirst({
      where: { id: userId, organizationId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        avatarUrl: true,
        role: true,
      },
    });

    return user ?? null;
  }

  private async getOrganization(organizationId: string) {
    const organization = await (this.prisma as any).organization.findUnique({
      where: { id: organizationId },
      select: {
        id: true,
        name: true,
        slug: true,
        logo: true,
        website: true,
        timezone: true,
        locale: true,
        status: true,
      },
    });

    return organization ?? null;
  }

  private slugify(value: string) {
    return value
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .replace(/-{2,}/g, '-');
  }

  private async getTicketStats(userId: string, organizationId: string) {
    const grouped = await (this.prisma as any).ticket.groupBy({
      by: ['status'],
      where: { organizationId, createdById: userId },
      _count: { _all: true },
    });

    const total = grouped.reduce(
      (sum: number, row: any) => sum + row._count._all,
      0,
    );
    const statusCounts = grouped.reduce(
      (acc: Record<string, number>, row: any) => {
        acc[row.status] = row._count._all;
        return acc;
      },
      {},
    );

    const openStatuses = [
      'OPEN',
      'IN_PROGRESS',
      'WAITING_FOR_CUSTOMER',
      'ON_HOLD',
      'ESCALATED',
      'REOPENED',
    ];
    const openCount = openStatuses.reduce(
      (sum: number, status: string) => sum + (statusCounts[status] ?? 0),
      0,
    );

    return {
      total,
      open: openCount,
      resolved: statusCounts['RESOLVED'] ?? 0,
      closed: statusCounts['CLOSED'] ?? 0,
      byStatus: statusCounts,
    };
  }
}
