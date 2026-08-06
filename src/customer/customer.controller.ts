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
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { CustomerRequestUser } from './types/customer-user.type';
import { CustomerPortalService } from './services/customer-portal.service';
import { CustomerProfileService } from './services/customer-profile.service';
import { CustomerNotificationService } from './services/notification.service';
import { KnowledgeBaseService } from './services/knowledge-base.service';
import { SupportInformationService } from './services/support-information.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ChangeCustomerPasswordDto } from './dto/change-customer-password.dto';
import { UpdatePreferencesDto } from './dto/update-preferences.dto';
import { UploadAvatarDto } from './dto/upload-avatar.dto';
import type { UploadedFile as UploadedAvatarFile } from './dto/upload-avatar.dto';
import { NotificationFilterDto } from './dto/notification-filter.dto';
import { KnowledgeBaseSearchDto } from './dto/knowledge-base-search.dto';
import { VoteArticleDto } from './dto/vote-article.dto';
import type { Request } from 'express';

@ApiTags('Customer Portal')
@ApiBearerAuth()
@Controller('customer')
@Roles('CUSTOMER')
export class CustomerController {
  constructor(
    private readonly customerPortalService: CustomerPortalService,
    private readonly customerProfileService: CustomerProfileService,
    private readonly notificationService: CustomerNotificationService,
    private readonly knowledgeBaseService: KnowledgeBaseService,
    private readonly supportInformationService: SupportInformationService,
  ) {}

  @Get('dashboard')
  @ApiOperation({ summary: 'Get customer portal dashboard' })
  @ApiResponse({
    status: 200,
    description: 'Dashboard data returned successfully',
  })
  async getDashboard(@CurrentUser() user: CustomerRequestUser) {
    return this.customerPortalService.getDashboard(
      user.userId,
      user.organizationId,
    );
  }

  @Get('profile')
  @ApiOperation({ summary: 'Get customer profile' })
  @ApiResponse({
    status: 200,
    description: 'Customer profile returned successfully',
  })
  async getProfile(@CurrentUser() user: CustomerRequestUser) {
    return this.customerProfileService.getProfile(
      user.userId,
      user.organizationId,
    );
  }

  @Patch('profile')
  @ApiOperation({ summary: 'Update customer profile' })
  @ApiBody({ type: UpdateProfileDto })
  @ApiResponse({
    status: 200,
    description: 'Customer profile updated successfully',
  })
  async updateProfile(
    @CurrentUser() user: CustomerRequestUser,
    @Body() dto: UpdateProfileDto,
    @Req() req: Request,
  ) {
    return this.customerProfileService.updateProfile(
      user.userId,
      user.organizationId,
      dto,
      req,
    );
  }

  @Patch('change-password')
  @ApiOperation({ summary: 'Change customer password' })
  @ApiBody({ type: ChangeCustomerPasswordDto })
  @ApiResponse({ status: 200, description: 'Password changed successfully' })
  async changePassword(
    @CurrentUser() user: CustomerRequestUser,
    @Body() dto: ChangeCustomerPasswordDto,
    @Req() req: Request,
  ) {
    return this.customerProfileService.changePassword(
      user.userId,
      user.organizationId,
      dto,
      req,
    );
  }

  @Patch('preferences')
  @ApiOperation({
    summary:
      'Update customer preferences (language, timezone, dark mode, notifications)',
  })
  @ApiBody({ type: UpdatePreferencesDto })
  @ApiResponse({ status: 200, description: 'Preferences updated successfully' })
  async updatePreferences(
    @CurrentUser() user: CustomerRequestUser,
    @Body() dto: UpdatePreferencesDto,
  ) {
    return this.customerProfileService.updatePreferences(
      user.userId,
      user.organizationId,
      dto,
    );
  }

  @Post('avatar')
  @ApiOperation({ summary: 'Upload customer avatar' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: UploadAvatarDto })
  @ApiResponse({ status: 201, description: 'Avatar uploaded successfully' })
  @UseInterceptors(FileInterceptor('file'))
  async uploadAvatar(
    @CurrentUser() user: CustomerRequestUser,
    @UploadedFile() file: UploadedAvatarFile,
    @Req() req: Request,
  ) {
    return this.customerProfileService.uploadAvatar(
      user.userId,
      user.organizationId,
      file,
      req,
    );
  }

  @Get('notifications')
  @ApiOperation({
    summary: 'List customer notifications with filtering and pagination',
  })
  @ApiResponse({
    status: 200,
    description: 'Notifications returned successfully',
  })
  async listNotifications(
    @CurrentUser() user: CustomerRequestUser,
    @Query() filter: NotificationFilterDto,
  ) {
    return this.notificationService.listNotifications(
      user.userId,
      user.organizationId,
      filter,
    );
  }

  @Patch('notifications/:id/read')
  @ApiOperation({ summary: 'Mark a notification as read' })
  @ApiParam({ name: 'id', type: 'string' })
  @ApiResponse({ status: 200, description: 'Notification marked as read' })
  async markNotificationRead(
    @CurrentUser() user: CustomerRequestUser,
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    return this.notificationService.markAsRead(
      user.userId,
      user.organizationId,
      id,
      req,
    );
  }

  @Patch('notifications/read-all')
  @ApiOperation({ summary: 'Mark all notifications as read' })
  @ApiResponse({ status: 200, description: 'All notifications marked as read' })
  async markAllNotificationsRead(@CurrentUser() user: CustomerRequestUser) {
    return this.notificationService.markAllAsRead(
      user.userId,
      user.organizationId,
    );
  }

  @Delete('notifications/:id')
  @ApiOperation({ summary: 'Delete a notification' })
  @ApiParam({ name: 'id', type: 'string' })
  @ApiResponse({ status: 200, description: 'Notification deleted' })
  async deleteNotification(
    @CurrentUser() user: CustomerRequestUser,
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    return this.notificationService.deleteNotification(
      user.userId,
      user.organizationId,
      id,
      req,
    );
  }

  @Get('knowledge-base')
  @ApiOperation({
    summary:
      'Get knowledge base overview (categories, recent and popular articles)',
  })
  @ApiResponse({
    status: 200,
    description: 'Knowledge base overview returned successfully',
  })
  async getKnowledgeBase(@CurrentUser() user: CustomerRequestUser) {
    return this.knowledgeBaseService.getKnowledgeBase(user.organizationId);
  }

  @Get('knowledge-base/categories')
  @ApiOperation({ summary: 'List knowledge base categories' })
  @ApiResponse({ status: 200, description: 'Categories returned successfully' })
  async getKnowledgeBaseCategories(@CurrentUser() user: CustomerRequestUser) {
    return this.knowledgeBaseService.getCategories(user.organizationId);
  }

  @Get('knowledge-base/articles')
  @ApiOperation({ summary: 'Search and list knowledge base articles' })
  @ApiResponse({ status: 200, description: 'Articles returned successfully' })
  async listKnowledgeBaseArticles(
    @CurrentUser() user: CustomerRequestUser,
    @Query() query: KnowledgeBaseSearchDto,
  ) {
    return this.knowledgeBaseService.listArticles(user.organizationId, query);
  }

  @Get('knowledge-base/articles/:id')
  @ApiOperation({ summary: 'Get a knowledge base article and record a view' })
  @ApiParam({ name: 'id', type: 'string' })
  @ApiResponse({ status: 200, description: 'Article returned successfully' })
  async getKnowledgeBaseArticle(
    @CurrentUser() user: CustomerRequestUser,
    @Param('id') id: string,
  ) {
    return this.knowledgeBaseService.getArticle(
      user.organizationId,
      user.userId,
      id,
    );
  }

  @Post('knowledge-base/articles/:id/vote')
  @ApiOperation({ summary: 'Vote on whether an article was helpful' })
  @ApiParam({ name: 'id', type: 'string' })
  @ApiBody({ type: VoteArticleDto })
  @ApiResponse({ status: 201, description: 'Vote recorded successfully' })
  async voteKnowledgeBaseArticle(
    @CurrentUser() user: CustomerRequestUser,
    @Param('id') id: string,
    @Body() dto: VoteArticleDto,
  ) {
    return this.knowledgeBaseService.voteArticle(
      user.organizationId,
      user.userId,
      id,
      dto,
    );
  }

  @Get('support')
  @ApiOperation({ summary: 'Get organization support contact information' })
  @ApiResponse({
    status: 200,
    description: 'Support information returned successfully',
  })
  async getSupportInformation(@CurrentUser() user: CustomerRequestUser) {
    return this.supportInformationService.getSupportInformation(
      user.organizationId,
    );
  }
}
