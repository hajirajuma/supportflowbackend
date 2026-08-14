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
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { OrganizationService } from './organization.service';
import { OrganizationSettingsService } from './organization-settings.service';
import { MemberService } from './member.service';
import { DepartmentService } from './department.service';
import { InvitationService } from './invitation.service';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { UpdateOrganizationSettingsDto } from './dto/update-organization-settings.dto';
import { InviteUserDto } from './dto/invite-user.dto';
import { AcceptInvitationDto } from './dto/accept-invitation.dto';
import { ResendInvitationDto } from './dto/resend-invitation.dto';
import { UpdateMemberRoleDto } from './dto/update-member-role.dto';
import { CreateDepartmentDto } from './dto/create-department.dto';
import { UpdateDepartmentDto } from './dto/update-department.dto';
import { UploadLogoDto } from './dto/upload-logo.dto';
import type { UploadedFile as UploadedImageFile } from './dto/upload-logo.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { TenantGuard } from '../common/guards/tenant.guard';

@ApiTags('Organization Management')
@Controller('organization')
@UseGuards(TenantGuard)
export class OrganizationController {
  constructor(
    private readonly organizationService: OrganizationService,
    private readonly settingsService: OrganizationSettingsService,
    private readonly memberService: MemberService,
    private readonly departmentService: DepartmentService,
    private readonly invitationService: InvitationService,
  ) {}

  @Get()
  @Roles('TENANT_OWNER', 'SUPPORT_AGENT')
  @ApiOperation({ summary: 'Get current organization profile' })
  @ApiResponse({
    status: 200,
    description: 'Organization profile returned successfully',
  })
  async getOrganization(@Req() req: any) {
    return this.organizationService.getOrganization(req.user.organizationId);
  }

  @Patch()
  @Roles('TENANT_OWNER')
  @ApiOperation({ summary: 'Update organization profile' })
  @ApiBody({ type: UpdateOrganizationDto })
  async updateOrganization(
    @Req() req: any,
    @Body() dto: UpdateOrganizationDto,
  ) {
    return this.organizationService.updateOrganization(
      req.user.organizationId,
      dto,
    );
  }

  @Post('logo')
  @Roles('TENANT_OWNER')
  @ApiOperation({ summary: 'Upload organization logo' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: UploadLogoDto })
  @UseInterceptors(FileInterceptor('file'))
  async uploadLogo(@Req() req: any, @UploadedFile() file: UploadedImageFile) {
    return this.organizationService.uploadLogo(
      req.user.organizationId,
      req.user.userId,
      file,
    );
  }

  @Post('favicon')
  @Roles('TENANT_OWNER')
  @ApiOperation({ summary: 'Upload organization favicon' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: UploadLogoDto })
  @UseInterceptors(FileInterceptor('file'))
  async uploadFavicon(
    @Req() req: any,
    @UploadedFile() file: UploadedImageFile,
  ) {
    return this.organizationService.uploadFavicon(
      req.user.organizationId,
      req.user.userId,
      file,
    );
  }

  @Get('settings')
  @Roles('TENANT_OWNER', 'SUPPORT_AGENT')
  @ApiOperation({ summary: 'Get organization settings' })
  async getSettings(@Req() req: any) {
    return this.settingsService.getSettings(req.user.organizationId);
  }

  @Patch('settings')
  @Roles('TENANT_OWNER')
  @ApiOperation({ summary: 'Update organization settings' })
  @ApiBody({ type: UpdateOrganizationSettingsDto })
  async updateSettings(
    @Req() req: any,
    @Body() dto: UpdateOrganizationSettingsDto,
  ) {
    return this.settingsService.updateSettings(req.user.organizationId, dto);
  }

  @Get('members')
  @Roles('TENANT_OWNER', 'SUPPORT_AGENT')
  @ApiOperation({ summary: 'Get organization members' })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'role', required: false })
  @ApiQuery({ name: 'status', required: false })
  async listMembers(
    @Req() req: any,
    @Query('search') search?: string,
    @Query('role') role?: string,
    @Query('status') status?: string,
  ) {
    return this.memberService.listMembers(req.user.organizationId, {
      search,
      role,
      status,
    });
  }

  @Get('members/:id')
  @Roles('TENANT_OWNER', 'SUPPORT_AGENT')
  @ApiOperation({ summary: 'Get organization member by id' })
  @ApiParam({ name: 'id', type: 'string' })
  async getMember(@Req() req: any, @Param('id') id: string) {
    return this.memberService.getMember(req.user.organizationId, id);
  }

  @Patch('members/:id')
  @Roles('TENANT_OWNER')
  @ApiOperation({ summary: 'Update member role or status' })
  @ApiBody({ type: UpdateMemberRoleDto })
  async updateMember(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateMemberRoleDto,
  ) {
    return this.memberService.updateMember(req.user.organizationId, id, dto);
  }

  @Post('members/:id/deactivate')
  @Roles('TENANT_OWNER')
  @ApiOperation({ summary: 'Deactivate a member' })
  @ApiParam({ name: 'id', type: 'string' })
  async deactivateMember(@Req() req: any, @Param('id') id: string) {
    return this.memberService.deactivateMember(req.user.organizationId, id);
  }

  @Post('members/:id/reactivate')
  @Roles('TENANT_OWNER')
  @ApiOperation({ summary: 'Reactivate a member' })
  @ApiParam({ name: 'id', type: 'string' })
  async reactivateMember(@Req() req: any, @Param('id') id: string) {
    return this.memberService.reactivateMember(req.user.organizationId, id);
  }

  @Delete('members/:id')
  @Roles('TENANT_OWNER')
  @ApiOperation({ summary: 'Remove a member from the organization' })
  async removeMember(@Req() req: any, @Param('id') id: string) {
    return this.memberService.removeMember(req.user.organizationId, id);
  }

  @Get('departments')
  @Roles('TENANT_OWNER', 'SUPPORT_AGENT')
  @ApiOperation({ summary: 'Get organization departments' })
  async listDepartments(@Req() req: any) {
    return this.departmentService.listDepartments(req.user.organizationId);
  }

  @Post('departments')
  @Roles('TENANT_OWNER')
  @ApiOperation({ summary: 'Create a department' })
  @ApiBody({ type: CreateDepartmentDto })
  async createDepartment(@Req() req: any, @Body() dto: CreateDepartmentDto) {
    return this.departmentService.createDepartment(
      req.user.organizationId,
      dto,
    );
  }

  @Patch('departments/:id')
  @Roles('TENANT_OWNER')
  @ApiOperation({ summary: 'Update a department' })
  @ApiParam({ name: 'id', type: 'string' })
  @ApiBody({ type: UpdateDepartmentDto })
  async updateDepartment(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateDepartmentDto,
  ) {
    return this.departmentService.updateDepartment(
      req.user.organizationId,
      id,
      dto,
    );
  }

  @Delete('departments/:id')
  @Roles('TENANT_OWNER')
  @ApiOperation({ summary: 'Delete a department' })
  @ApiParam({ name: 'id', type: 'string' })
  async deleteDepartment(@Req() req: any, @Param('id') id: string) {
    return this.departmentService.deleteDepartment(req.user.organizationId, id);
  }

  @Post('invitations')
  @Roles('TENANT_OWNER')
  @ApiOperation({ summary: 'Invite a new member to the organization' })
  @ApiBody({ type: InviteUserDto })
  async inviteUser(@Req() req: any, @Body() dto: InviteUserDto) {
    return this.invitationService.createInvitation(
      req.user.userId,
      req.user.organizationId,
      dto,
    );
  }

  @Get('invitations')
  @Roles('TENANT_OWNER')
  @ApiOperation({ summary: 'List pending and recent invitations' })
  async listInvitations(@Req() req: any) {
    return this.invitationService.listInvitations(req.user.organizationId);
  }

  @Post('invitations/:id/resend')
  @Roles('TENANT_OWNER')
  @ApiOperation({ summary: 'Resend an invitation email' })
  @ApiBody({ type: ResendInvitationDto })
  async resendInvitation(
    @Req() req: any,
    @Param('id') id: string,
    @Body() _dto: ResendInvitationDto,
  ) {
    return this.invitationService.resendInvitation(req.user.organizationId, id);
  }

  @Delete('invitations/:id')
  @Roles('TENANT_OWNER')
  @ApiOperation({ summary: 'Cancel a pending invitation' })
  async cancelInvitation(@Req() req: any, @Param('id') id: string) {
    return this.invitationService.cancelInvitation(req.user.organizationId, id);
  }

  @Get('invitations/accept')
  @ApiOperation({ summary: 'Get invitation acceptance info' })
  async getInvitationAcceptance(@Query('token') token: string) {
    return this.invitationService.validateInvitationToken(token);
  }

  @Post('invitations/accept')
  @ApiOperation({
    summary: 'Accept an organization invitation and activate the account',
  })
  @ApiBody({ type: AcceptInvitationDto })
  async acceptInvitation(@Body() dto: AcceptInvitationDto) {
    return this.invitationService.acceptInvitation(dto);
  }
}
