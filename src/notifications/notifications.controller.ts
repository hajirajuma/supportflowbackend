import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { NotificationAccessGuard } from './guards/notification-access.guard';
import { Access } from './decorators/access.decorator';
import type { NotificationAccess } from './enums/notification.enums';
import { NotificationService } from './services/notification.service';
import { NotificationPreferenceService } from './services/notification-preference.service';
import { NotificationTemplateService } from './services/notification-template.service';
import { AnnouncementService } from './services/announcement.service';
import { NotificationFilterDto } from './dto/notification-filter.dto';
import { NotificationSearchDto } from './dto/notification-search.dto';
import { NotificationPreferencesDto } from './dto/notification-preferences.dto';
import {
  CreateNotificationTemplateDto,
  UpdateNotificationTemplateDto,
} from './dto/notification-template.dto';
import {
  CreateAnnouncementDto,
  UpdateAnnouncementDto,
} from './dto/announcement.dto';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import type { Request } from 'express';

@ApiTags('Notifications')
@ApiBearerAuth()
@UseGuards(NotificationAccessGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly notificationService: NotificationService,
    private readonly preferenceService: NotificationPreferenceService,
    private readonly templateService: NotificationTemplateService,
    private readonly announcementService: AnnouncementService,
  ) {}

  // -------------------------------------------------------------------------
  // List / read
  // -------------------------------------------------------------------------

  @Get()
  @ApiOperation({ summary: 'List notifications with filtering and pagination' })
  @ApiResponse({
    status: 200,
    description: 'Notifications returned',
    schema: {
      example: {
        items: [
          {
            id: 'notif_1',
            type: 'TICKET_RESOLVED',
            channel: 'IN_APP',
            priority: 'MEDIUM',
            title: 'Ticket #SF-1042 has been resolved',
            body: 'Your ticket has been resolved.',
            isRead: false,
            isArchived: false,
            createdAt: '2026-08-04T09:00:00.000Z',
          },
        ],
        total: 1,
        page: 1,
        limit: 20,
        unreadCount: 5,
      },
    },
  })
  async list(
    @Access() access: NotificationAccess,
    @Query() query: NotificationFilterDto,
  ) {
    return this.notificationService.list(access, query);
  }

  @Get('unread')
  @ApiOperation({ summary: 'List unread notifications' })
  @ApiResponse({ status: 200, description: 'Unread notifications returned' })
  async listUnread(
    @Access() access: NotificationAccess,
    @Query() query: NotificationFilterDto,
  ) {
    return this.notificationService.listUnread(access, query);
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Get the current unread notification count' })
  @ApiResponse({
    status: 200,
    description: 'Unread count returned',
    schema: { example: { unreadCount: 5 } },
  })
  async unreadCount(@Access() access: NotificationAccess) {
    return this.notificationService.getUnreadCount(access);
  }

  @Get('search')
  @ApiOperation({
    summary: 'Search notifications by title, body, type, user, org, date',
  })
  @ApiResponse({
    status: 200,
    description: 'Search results returned',
    schema: {
      example: {
        items: [],
        total: 0,
        page: 1,
        limit: 20,
        totalPages: 0,
        hasNextPage: false,
        hasPreviousPage: false,
      },
    },
  })
  async search(
    @Access() access: NotificationAccess,
    @Query() query: NotificationSearchDto,
  ) {
    return this.notificationService.search(access, query);
  }

  // -------------------------------------------------------------------------
  // Preferences
  // -------------------------------------------------------------------------

  @Get('preferences')
  @ApiOperation({ summary: 'Get the current user notification preferences' })
  @ApiResponse({
    status: 200,
    description: 'Preferences returned',
    schema: {
      example: {
        enableEmail: true,
        enableInApp: true,
        enableRealtime: true,
        enableTicketUpdates: true,
        enableFeedbackNotifications: true,
        enableMarketingEmails: false,
        enableSecurityAlerts: true,
        quietHoursStart: '22:00',
        quietHoursEnd: '07:00',
        language: 'en',
        timezone: 'Europe/London',
        overrides: { 'TICKET_ASSIGNED:EMAIL': false },
      },
    },
  })
  async getPreferences(@Access() access: NotificationAccess) {
    return this.preferenceService.getPreferences(access);
  }

  @Patch('preferences')
  @ApiOperation({
    summary:
      'Update notification preferences (incl. overrides and quiet hours)',
  })
  @ApiBody({ type: NotificationPreferencesDto })
  @ApiResponse({
    status: 200,
    description: 'Preferences updated and returned',
    schema: {
      example: {
        enableEmail: true,
        enableInApp: false,
        quietHoursStart: null,
        quietHoursEnd: null,
        overrides: {},
      },
    },
  })
  async updatePreferences(
    @Access() access: NotificationAccess,
    @Body() dto: NotificationPreferencesDto,
    @Req() req: Request,
  ) {
    return this.preferenceService.updatePreferences(access, dto, req);
  }

  // -------------------------------------------------------------------------
  // Templates
  // -------------------------------------------------------------------------

  @Get('templates')
  @ApiOperation({ summary: 'List notification templates' })
  @ApiResponse({
    status: 200,
    description: 'Templates returned',
    schema: {
      example: {
        items: [
          {
            id: 'tpl_1',
            name: 'Ticket resolved',
            slug: 'ticket-resolved',
            type: 'TICKET_RESOLVED',
            channel: 'EMAIL',
            subject: 'Ticket #{{ticketNumber}} has been resolved',
            status: 'ACTIVE',
            enabled: true,
          },
        ],
        total: 1,
        page: 1,
        limit: 20,
      },
    },
  })
  async listTemplates(
    @Access() access: NotificationAccess,
    @Query() query: PaginationQueryDto,
  ) {
    return this.templateService.list(access, query);
  }

  @Post('templates')
  @ApiOperation({ summary: 'Create a notification template' })
  @ApiBody({ type: CreateNotificationTemplateDto })
  @ApiResponse({ status: 201, description: 'Template created' })
  async createTemplate(
    @Access() access: NotificationAccess,
    @Body() dto: CreateNotificationTemplateDto,
    @Req() req: Request,
  ) {
    return this.templateService.create(access, dto, req);
  }

  @Patch('templates/:id')
  @ApiOperation({ summary: 'Update a notification template' })
  @ApiParam({ name: 'id', type: 'string' })
  @ApiBody({ type: UpdateNotificationTemplateDto })
  @ApiResponse({ status: 200, description: 'Template updated' })
  async updateTemplate(
    @Access() access: NotificationAccess,
    @Param('id') id: string,
    @Body() dto: UpdateNotificationTemplateDto,
    @Req() req: Request,
  ) {
    return this.templateService.update(access, id, dto, req);
  }

  @Delete('templates/:id')
  @ApiOperation({ summary: 'Delete a notification template' })
  @ApiParam({ name: 'id', type: 'string' })
  @ApiResponse({ status: 200, description: 'Template deleted' })
  async deleteTemplate(
    @Access() access: NotificationAccess,
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    return this.templateService.remove(access, id, req);
  }

  // -------------------------------------------------------------------------
  // Announcements
  // -------------------------------------------------------------------------

  @Get('announcements')
  @ApiOperation({ summary: 'List announcements' })
  @ApiResponse({
    status: 200,
    description: 'Announcements returned',
    schema: {
      example: {
        items: [
          {
            id: 'ann_1',
            title: 'Scheduled maintenance on August 10',
            body: 'The platform will be briefly unavailable on 10 Aug 02:00-03:00 UTC.',
            status: 'PUBLISHED',
            priority: 'HIGH',
            audience: 'ALL',
            scheduledAt: null,
            publishedAt: '2026-08-01T08:00:00.000Z',
            expiresAt: '2026-08-20T23:59:00.000Z',
          },
        ],
        total: 1,
        page: 1,
        limit: 20,
      },
    },
  })
  async listAnnouncements(
    @Access() access: NotificationAccess,
    @Query() query: PaginationQueryDto,
  ) {
    return this.announcementService.list(access, query);
  }

  @Post('announcements')
  @ApiOperation({ summary: 'Create (and publish) an announcement' })
  @ApiBody({ type: CreateAnnouncementDto })
  @ApiResponse({ status: 201, description: 'Announcement created' })
  async createAnnouncement(
    @Access() access: NotificationAccess,
    @Body() dto: CreateAnnouncementDto,
    @Req() req: Request,
  ) {
    return this.announcementService.create(access, dto, req);
  }

  @Patch('announcements/:id')
  @ApiOperation({ summary: 'Update an announcement' })
  @ApiParam({ name: 'id', type: 'string' })
  @ApiBody({ type: UpdateAnnouncementDto })
  @ApiResponse({ status: 200, description: 'Announcement updated' })
  async updateAnnouncement(
    @Access() access: NotificationAccess,
    @Param('id') id: string,
    @Body() dto: UpdateAnnouncementDto,
    @Req() req: Request,
  ) {
    return this.announcementService.update(access, id, dto, req);
  }

  @Delete('announcements/:id')
  @ApiOperation({ summary: 'Delete an announcement' })
  @ApiParam({ name: 'id', type: 'string' })
  @ApiResponse({ status: 200, description: 'Announcement deleted' })
  async deleteAnnouncement(
    @Access() access: NotificationAccess,
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    return this.announcementService.remove(access, id, req);
  }

  // -------------------------------------------------------------------------
  // Single notification mutations
  // -------------------------------------------------------------------------

  @Get(':id')
  @ApiOperation({ summary: 'Get a single notification' })
  @ApiParam({ name: 'id', type: 'string' })
  @ApiResponse({
    status: 200,
    description: 'Notification returned',
    schema: {
      example: {
        id: 'notif_1',
        type: 'TICKET_RESOLVED',
        channel: 'IN_APP',
        priority: 'MEDIUM',
        title: 'Ticket #SF-1042 has been resolved',
        body: 'Your ticket has been resolved.',
        data: { ticketId: 'tkt_1' },
        isRead: true,
        readAt: '2026-08-04T09:05:00.000Z',
        createdAt: '2026-08-04T09:00:00.000Z',
      },
    },
  })
  async getOne(@Access() access: NotificationAccess, @Param('id') id: string) {
    return this.notificationService.getOne(access, id);
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Mark a notification as read' })
  @ApiParam({ name: 'id', type: 'string' })
  @ApiResponse({ status: 200, description: 'Notification marked as read' })
  async markAsRead(
    @Access() access: NotificationAccess,
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    return this.notificationService.markAsRead(access, id, req);
  }

  @Patch('read-all')
  @ApiOperation({ summary: 'Mark all notifications as read' })
  @ApiResponse({
    status: 200,
    description: 'All notifications marked as read',
    schema: { example: { updatedCount: 12 } },
  })
  async markAllAsRead(@Access() access: NotificationAccess) {
    return this.notificationService.markAllAsRead(access);
  }

  @Patch(':id/archive')
  @ApiOperation({ summary: 'Archive a notification' })
  @ApiParam({ name: 'id', type: 'string' })
  @ApiResponse({ status: 200, description: 'Notification archived' })
  async archive(
    @Access() access: NotificationAccess,
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    return this.notificationService.archive(access, id, req);
  }

  @Patch(':id/restore')
  @ApiOperation({ summary: 'Restore an archived notification' })
  @ApiParam({ name: 'id', type: 'string' })
  @ApiResponse({ status: 200, description: 'Notification restored' })
  async restore(
    @Access() access: NotificationAccess,
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    return this.notificationService.restore(access, id, req);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a notification' })
  @ApiParam({ name: 'id', type: 'string' })
  @ApiResponse({ status: 200, description: 'Notification deleted' })
  async remove(
    @Access() access: NotificationAccess,
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    return this.notificationService.remove(access, id, req);
  }
}
