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
  Put,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { Access } from '../dashboard/decorators/access.decorator';
import { DashboardRoles } from '../dashboard/decorators/dashboard-roles.decorator';
import { DashboardAccessGuard } from '../dashboard/guards/dashboard-access.guard';
import { DashboardRole } from '../dashboard/enums/dashboard.enums';
import type { DashboardAccess } from '../dashboard/types/dashboard-access.type';
import { PlatformAdminService } from './platform-admin.service';
import { PlatformAdminQueryDto } from './dto/platform-admin-query.dto';
import { CreatePlatformOrganizationDto } from './dto/create-platform-organization.dto';
import { UpdatePlatformOrganizationDto } from './dto/update-platform-organization.dto';
import { CreatePlatformUserDto } from './dto/create-platform-user.dto';
import { UpdatePlatformUserDto } from './dto/update-platform-user.dto';
import { UpdatePlatformSettingDto } from './dto/platform-admin-setting.dto';
import { TransferOrganizationOwnershipDto } from './dto/transfer-organization-ownership.dto';
import { CreatePlanDto } from '../subscriptions/dto/create-plan.dto';
import { UpdatePlanDto } from '../subscriptions/dto/update-plan.dto';
import {
  CreateAnnouncementDto,
  UpdateAnnouncementDto,
} from '../notifications/dto/announcement.dto';

@ApiTags('Platform Administration')
@ApiBearerAuth()
@UseGuards(DashboardAccessGuard)
@DashboardRoles(DashboardRole.PLATFORM_ADMIN)
@Controller('platform-admin')
export class PlatformAdminController {
  constructor(private readonly platformAdminService: PlatformAdminService) {}

  @Get('overview')
  @ApiOperation({ summary: 'Get platform overview and health' })
  overview(@Access() access: DashboardAccess) {
    return this.platformAdminService.getOverview(access);
  }

  @Get('organizations')
  @ApiOperation({ summary: 'List organizations' })
  listOrganizations(
    @Access() access: DashboardAccess,
    @Query() query: PlatformAdminQueryDto,
  ) {
    return this.platformAdminService.listOrganizations(access, query);
  }

  @Post('organizations')
  @ApiOperation({ summary: 'Create organization' })
  @ApiBody({ type: CreatePlatformOrganizationDto })
  createOrganization(
    @Access() access: DashboardAccess,
    @Body() dto: CreatePlatformOrganizationDto,
    @Req() request: Request,
  ) {
    return this.platformAdminService.createOrganization(access, dto, request);
  }

  @Get('organizations/:id')
  @ApiOperation({ summary: 'Get organization detail' })
  @ApiParam({ name: 'id', type: 'string' })
  getOrganization(@Access() access: DashboardAccess, @Param('id') id: string) {
    return this.platformAdminService.getOrganization(access, id);
  }

  @Patch('organizations/:id')
  @ApiOperation({ summary: 'Update organization' })
  @ApiParam({ name: 'id', type: 'string' })
  @ApiBody({ type: UpdatePlatformOrganizationDto })
  updateOrganization(
    @Access() access: DashboardAccess,
    @Param('id') id: string,
    @Body() dto: UpdatePlatformOrganizationDto,
    @Req() request: Request,
  ) {
    return this.platformAdminService.updateOrganization(
      access,
      id,
      dto,
      request,
    );
  }

  @Post('organizations/:id/suspend')
  suspendOrganization(
    @Access() access: DashboardAccess,
    @Param('id') id: string,
    @Req() request: Request,
  ) {
    return this.platformAdminService.suspendOrganization(access, id, request);
  }

  @Post('organizations/:id/activate')
  activateOrganization(
    @Access() access: DashboardAccess,
    @Param('id') id: string,
    @Req() request: Request,
  ) {
    return this.platformAdminService.activateOrganization(access, id, request);
  }

  @Post('organizations/:id/archive')
  archiveOrganization(
    @Access() access: DashboardAccess,
    @Param('id') id: string,
    @Req() request: Request,
  ) {
    return this.platformAdminService.archiveOrganization(access, id, request);
  }

  @Post('organizations/:id/restore')
  restoreOrganization(
    @Access() access: DashboardAccess,
    @Param('id') id: string,
    @Req() request: Request,
  ) {
    return this.platformAdminService.restoreOrganization(access, id, request);
  }

  @Post('organizations/:id/transfer-ownership')
  @ApiBody({ type: TransferOrganizationOwnershipDto })
  transferOwnership(
    @Access() access: DashboardAccess,
    @Param('id') id: string,
    @Body() dto: TransferOrganizationOwnershipDto,
    @Req() request: Request,
  ) {
    return this.platformAdminService.transferOwnership(
      access,
      id,
      dto,
      request,
    );
  }

  @Post('organizations/:id/reset-settings')
  resetSettings(@Access() access: DashboardAccess, @Param('id') id: string) {
    return this.platformAdminService.resetTenantSettings(access, id);
  }

  @Post('organizations/:id/reset-branding')
  resetBranding(@Access() access: DashboardAccess, @Param('id') id: string) {
    return this.platformAdminService.resetBranding(access, id);
  }

  @Get('organizations/:id/stats')
  organizationStats(
    @Access() access: DashboardAccess,
    @Param('id') id: string,
  ) {
    return this.platformAdminService.organizationStats(access, id);
  }

  @Get('organizations/:id/activity')
  organizationActivity(
    @Access() access: DashboardAccess,
    @Param('id') id: string,
    @Query() query: PlatformAdminQueryDto,
  ) {
    return this.platformAdminService.organizationActivity(access, id, query);
  }

  @Get('organizations/:id/users')
  organizationUsers(
    @Access() access: DashboardAccess,
    @Param('id') id: string,
  ) {
    return this.platformAdminService.listOrganizationUsers(access, id);
  }

  @Get('users')
  listUsers(
    @Access() access: DashboardAccess,
    @Query() query: PlatformAdminQueryDto,
  ) {
    return this.platformAdminService.listUsers(access, query);
  }

  @Post('users')
  @ApiBody({ type: CreatePlatformUserDto })
  createUser(
    @Access() access: DashboardAccess,
    @Body() dto: CreatePlatformUserDto,
    @Req() request: Request,
  ) {
    return this.platformAdminService.createUser(access, dto, request);
  }

  @Patch('users/:id')
  @ApiBody({ type: UpdatePlatformUserDto })
  updateUser(
    @Access() access: DashboardAccess,
    @Param('id') id: string,
    @Body() dto: UpdatePlatformUserDto,
    @Req() request: Request,
  ) {
    return this.platformAdminService.updateUser(access, id, dto, request);
  }

  @Post('users/:id/suspend')
  suspendUser(
    @Access() access: DashboardAccess,
    @Param('id') id: string,
    @Req() request: Request,
  ) {
    return this.platformAdminService.suspendUser(access, id, request);
  }

  @Post('users/:id/activate')
  activateUser(
    @Access() access: DashboardAccess,
    @Param('id') id: string,
    @Req() request: Request,
  ) {
    return this.platformAdminService.activateUser(access, id, request);
  }

  @Delete('users/:id')
  deleteUser(
    @Access() access: DashboardAccess,
    @Param('id') id: string,
    @Req() request: Request,
  ) {
    return this.platformAdminService.deleteUser(access, id, request);
  }

  @Post('users/:id/reset-password')
  resetPassword(
    @Access() access: DashboardAccess,
    @Param('id') id: string,
    @Body('password') password: string,
    @Req() request: Request,
  ) {
    return this.platformAdminService.resetUserPassword(
      access,
      id,
      password,
      request,
    );
  }

  @Post('users/:id/force-logout')
  forceLogout(
    @Access() access: DashboardAccess,
    @Param('id') id: string,
    @Req() request: Request,
  ) {
    return this.platformAdminService.forceLogout(access, id, request);
  }

  @Post('users/:id/verify-email')
  verifyEmail(
    @Access() access: DashboardAccess,
    @Param('id') id: string,
    @Req() request: Request,
  ) {
    return this.platformAdminService.verifyUserEmail(access, id, request);
  }

  @Get('subscriptions/plans')
  listPlans(@Access() access: DashboardAccess) {
    return this.platformAdminService.listPlans(access);
  }

  @Post('subscriptions/plans')
  @ApiBody({ type: CreatePlanDto })
  createPlan(
    @Access() access: DashboardAccess,
    @Body() dto: CreatePlanDto,
    @Req() request: Request,
  ) {
    return this.platformAdminService.createPlan(access, dto, request);
  }

  @Patch('subscriptions/plans/:id')
  @ApiBody({ type: UpdatePlanDto })
  updatePlan(
    @Access() access: DashboardAccess,
    @Param('id') id: string,
    @Body() dto: UpdatePlanDto,
    @Req() request: Request,
  ) {
    return this.platformAdminService.updatePlan(access, id, dto, request);
  }

  @Delete('subscriptions/plans/:id')
  deletePlan(
    @Access() access: DashboardAccess,
    @Param('id') id: string,
    @Req() request: Request,
  ) {
    return this.platformAdminService.deletePlan(access, id, request);
  }

  @Get('subscriptions')
  listSubscriptions(
    @Access() access: DashboardAccess,
    @Query() query: PlatformAdminQueryDto,
  ) {
    return this.platformAdminService.listSubscriptions(access, query);
  }

  @Patch('subscriptions/:id')
  updateSubscription(
    @Access() access: DashboardAccess,
    @Param('id') id: string,
    @Body() body: Record<string, any>,
    @Req() request: Request,
  ) {
    return this.platformAdminService.updateSubscription(
      access,
      id,
      body,
      request,
    );
  }

  @Post('subscriptions/:id/suspend')
  suspendSubscription(
    @Access() access: DashboardAccess,
    @Param('id') id: string,
    @Req() request: Request,
  ) {
    return this.platformAdminService.suspendSubscription(access, id, request);
  }

  @Post('subscriptions/:id/renew')
  renewSubscription(
    @Access() access: DashboardAccess,
    @Param('id') id: string,
    @Req() request: Request,
  ) {
    return this.platformAdminService.renewSubscription(access, id, request);
  }

  @Get('payments')
  listPayments(
    @Access() access: DashboardAccess,
    @Query() query: PlatformAdminQueryDto,
  ) {
    return this.platformAdminService.listPayments(access, query);
  }

  @Get('payments/stats')
  paymentStats(@Access() access: DashboardAccess) {
    return this.platformAdminService.paymentStats(access);
  }

  @Get('tickets')
  listTickets(
    @Access() access: DashboardAccess,
    @Query() query: PlatformAdminQueryDto,
  ) {
    return this.platformAdminService.listTickets(access, query);
  }

  @Get('tickets/:id')
  getTicket(@Access() access: DashboardAccess, @Param('id') id: string) {
    return this.platformAdminService.getTicket(access, id);
  }

  @Post('tickets/:id/force-close')
  forceCloseTicket(
    @Access() access: DashboardAccess,
    @Param('id') id: string,
    @Req() request: Request,
  ) {
    return this.platformAdminService.forceCloseTicket(access, id, request);
  }

  @Post('tickets/:id/restore')
  restoreTicket(
    @Access() access: DashboardAccess,
    @Param('id') id: string,
    @Req() request: Request,
  ) {
    return this.platformAdminService.restoreTicket(access, id, request);
  }

  @Get('knowledge/categories')
  listKnowledgeCategories(
    @Access() access: DashboardAccess,
    @Query('organizationId') organizationId?: string,
  ) {
    return this.platformAdminService.listKnowledgeCategories(
      access,
      organizationId,
    );
  }

  @Get('knowledge/articles')
  listKnowledgeArticles(
    @Access() access: DashboardAccess,
    @Query() query: PlatformAdminQueryDto,
  ) {
    return this.platformAdminService.listKnowledgeArticles(access, query);
  }

  @Get('announcements')
  listAnnouncements(
    @Access() access: DashboardAccess,
    @Query() query: PlatformAdminQueryDto,
  ) {
    return this.platformAdminService.listAnnouncements(access, query);
  }

  @Post('announcements')
  @ApiBody({ type: CreateAnnouncementDto })
  createAnnouncement(
    @Access() access: DashboardAccess,
    @Body() dto: CreateAnnouncementDto,
    @Req() request: Request,
  ) {
    return this.platformAdminService.createAnnouncement(access, dto, request);
  }

  @Patch('announcements/:id')
  @ApiBody({ type: UpdateAnnouncementDto })
  updateAnnouncement(
    @Access() access: DashboardAccess,
    @Param('id') id: string,
    @Body() dto: UpdateAnnouncementDto,
    @Req() request: Request,
  ) {
    return this.platformAdminService.updateAnnouncement(
      access,
      id,
      dto,
      request,
    );
  }

  @Delete('announcements/:id')
  deleteAnnouncement(
    @Access() access: DashboardAccess,
    @Param('id') id: string,
    @Req() request: Request,
  ) {
    return this.platformAdminService.deleteAnnouncement(access, id, request);
  }

  @Post('announcements/:id/publish')
  publishAnnouncement(
    @Access() access: DashboardAccess,
    @Param('id') id: string,
    @Req() request: Request,
  ) {
    return this.platformAdminService.publishAnnouncement(access, id, request);
  }

  @Get('audit-logs')
  listAuditLogs(
    @Access() access: DashboardAccess,
    @Query() query: PlatformAdminQueryDto,
  ) {
    return this.platformAdminService.listAuditLogs(access, query);
  }

  @Get('settings')
  listSettings(@Access() access: DashboardAccess) {
    return this.platformAdminService.listPlatformSettings(access);
  }

  @Put('settings')
  @ApiBody({ type: UpdatePlatformSettingDto })
  updateSetting(
    @Access() access: DashboardAccess,
    @Body() dto: UpdatePlatformSettingDto,
    @Req() request: Request,
  ) {
    return this.platformAdminService.updatePlatformSetting(
      access,
      dto,
      request,
    );
  }

  @Get('health')
  health() {
    return this.platformAdminService.getSystemHealth();
  }
}
