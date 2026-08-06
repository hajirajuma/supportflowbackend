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
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { TicketAccessGuard } from './guards/ticket-access.guard';
import { Access } from './decorators/access.decorator';
import type { TicketAccess } from './types/ticket-access.type';
import { TicketService } from './services/ticket.service';
import { TicketReplyService } from './services/ticket-reply.service';
import { TicketAttachmentService } from './services/ticket-attachment.service';
import { TicketWatcherService } from './services/ticket-watcher.service';
import { TicketTagService } from './services/ticket-tag.service';
import { TicketAssignmentService } from './services/ticket-assignment.service';
import { TicketSearchService } from './services/ticket-search.service';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { UpdateTicketDto } from './dto/update-ticket.dto';
import { UpdateStatusDto } from './dto/update-status.dto';
import { UpdatePriorityDto } from './dto/update-priority.dto';
import { AssignTicketDto } from './dto/assign-ticket.dto';
import { ReassignTicketDto } from './dto/reassign-ticket.dto';
import { CreateReplyDto } from './dto/create-reply.dto';
import { UpdateReplyDto } from './dto/update-reply.dto';
import { UploadAttachmentDto } from './dto/upload-attachment.dto';
import type { UploadedFile } from './dto/upload-attachment.dto';
import { SearchTicketDto } from './dto/search-ticket.dto';
import { TicketFilterDto } from './dto/ticket-filter.dto';
import { AssignTagDto } from './dto/assign-tag.dto';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import type { Request } from 'express';

@ApiTags('Tickets')
@ApiBearerAuth()
@UseGuards(TicketAccessGuard)
@Controller('tickets')
export class TicketsController {
  constructor(
    private readonly ticketService: TicketService,
    private readonly replyService: TicketReplyService,
    private readonly attachmentService: TicketAttachmentService,
    private readonly watcherService: TicketWatcherService,
    private readonly tagService: TicketTagService,
    private readonly assignmentService: TicketAssignmentService,
    private readonly searchService: TicketSearchService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a new ticket' })
  @ApiBody({ type: CreateTicketDto })
  @ApiResponse({ status: 201, description: 'Ticket created' })
  async create(
    @Access() access: TicketAccess,
    @Body() dto: CreateTicketDto,
    @Req() req: Request,
  ) {
    return this.ticketService.create(access, dto, req);
  }

  @Get()
  @ApiOperation({
    summary: 'List tickets with filtering, sorting and pagination',
  })
  @ApiResponse({ status: 200, description: 'Tickets returned' })
  async list(@Access() access: TicketAccess, @Query() filter: TicketFilterDto) {
    return this.searchService.search(access, filter);
  }

  @Get('search')
  @ApiOperation({ summary: 'Search tickets' })
  @ApiResponse({ status: 200, description: 'Search results returned' })
  async search(@Access() access: TicketAccess, @Query() dto: SearchTicketDto) {
    return this.searchService.search(access, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get ticket details' })
  @ApiParam({ name: 'id', type: 'string' })
  @ApiResponse({ status: 200, description: 'Ticket details returned' })
  async getOne(@Access() access: TicketAccess, @Param('id') id: string) {
    return this.ticketService.getOne(access, id);
  }

  @Patch('replies/:replyId')
  @ApiOperation({ summary: 'Edit a reply' })
  @ApiParam({ name: 'replyId', type: 'string' })
  @ApiBody({ type: UpdateReplyDto })
  @ApiResponse({ status: 200, description: 'Reply updated' })
  async updateReply(
    @Access() access: TicketAccess,
    @Param('replyId') replyId: string,
    @Body() dto: UpdateReplyDto,
    @Req() req: Request,
  ) {
    const ticket = await this.ticketService.getTicketForReply(access, replyId);
    return this.replyService.update(access, ticket, replyId, dto, req);
  }

  @Delete('attachments/:attachmentId')
  @ApiOperation({ summary: 'Delete an attachment' })
  @ApiParam({ name: 'attachmentId', type: 'string' })
  @ApiResponse({ status: 200, description: 'Attachment deleted' })
  async deleteAttachment(
    @Access() access: TicketAccess,
    @Param('attachmentId') attachmentId: string,
    @Req() req: Request,
  ) {
    const ticket = await this.ticketService.getTicketForAttachment(
      access,
      attachmentId,
    );
    return this.attachmentService.remove(access, ticket, attachmentId, req);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a ticket' })
  @ApiParam({ name: 'id', type: 'string' })
  @ApiBody({ type: UpdateTicketDto })
  @ApiResponse({ status: 200, description: 'Ticket updated' })
  async update(
    @Access() access: TicketAccess,
    @Param('id') id: string,
    @Body() dto: UpdateTicketDto,
    @Req() req: Request,
  ) {
    return this.ticketService.update(access, id, dto, req);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft delete a ticket' })
  @ApiParam({ name: 'id', type: 'string' })
  @ApiResponse({ status: 200, description: 'Ticket deleted' })
  async remove(
    @Access() access: TicketAccess,
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    return this.ticketService.remove(access, id, req);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Change ticket status' })
  @ApiParam({ name: 'id', type: 'string' })
  @ApiBody({ type: UpdateStatusDto })
  @ApiResponse({ status: 200, description: 'Status updated' })
  async changeStatus(
    @Access() access: TicketAccess,
    @Param('id') id: string,
    @Body() dto: UpdateStatusDto,
    @Req() req: Request,
  ) {
    return this.ticketService.changeStatus(access, id, dto, req);
  }

  @Patch(':id/priority')
  @ApiOperation({ summary: 'Change ticket priority' })
  @ApiParam({ name: 'id', type: 'string' })
  @ApiBody({ type: UpdatePriorityDto })
  @ApiResponse({ status: 200, description: 'Priority updated' })
  async changePriority(
    @Access() access: TicketAccess,
    @Param('id') id: string,
    @Body() dto: UpdatePriorityDto,
    @Req() req: Request,
  ) {
    return this.ticketService.changePriority(access, id, dto, req);
  }

  @Patch(':id/assign')
  @ApiOperation({
    summary:
      'Assign a ticket (omit assigneeId to self-assign, null to unassign)',
  })
  @ApiParam({ name: 'id', type: 'string' })
  @ApiBody({ type: AssignTicketDto })
  @ApiResponse({ status: 200, description: 'Ticket assigned' })
  async assign(
    @Access() access: TicketAccess,
    @Param('id') id: string,
    @Body() dto: AssignTicketDto,
    @Req() req: Request,
  ) {
    const ticket = await this.ticketService.getAccessibleTicket(access, id);
    return this.assignmentService.assign(access, ticket, dto, req);
  }

  @Patch(':id/reassign')
  @ApiOperation({ summary: 'Reassign a ticket to another agent' })
  @ApiParam({ name: 'id', type: 'string' })
  @ApiBody({ type: ReassignTicketDto })
  @ApiResponse({ status: 200, description: 'Ticket reassigned' })
  async reassign(
    @Access() access: TicketAccess,
    @Param('id') id: string,
    @Body() dto: ReassignTicketDto,
    @Req() req: Request,
  ) {
    const ticket = await this.ticketService.getAccessibleTicket(access, id);
    return this.assignmentService.reassign(access, ticket, dto, req);
  }

  @Patch(':id/close')
  @ApiOperation({ summary: 'Close a ticket' })
  @ApiParam({ name: 'id', type: 'string' })
  @ApiResponse({ status: 200, description: 'Ticket closed' })
  async close(
    @Access() access: TicketAccess,
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    return this.ticketService.close(access, id, req);
  }

  @Patch(':id/reopen')
  @ApiOperation({ summary: 'Reopen a ticket' })
  @ApiParam({ name: 'id', type: 'string' })
  @ApiResponse({ status: 200, description: 'Ticket reopened' })
  async reopen(
    @Access() access: TicketAccess,
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    return this.ticketService.reopen(access, id, req);
  }

  @Post(':id/replies')
  @ApiOperation({ summary: 'Add a reply or internal note to a ticket' })
  @ApiParam({ name: 'id', type: 'string' })
  @ApiBody({ type: CreateReplyDto })
  @ApiResponse({ status: 201, description: 'Reply created' })
  async createReply(
    @Access() access: TicketAccess,
    @Param('id') id: string,
    @Body() dto: CreateReplyDto,
    @Req() req: Request,
  ) {
    const ticket = await this.ticketService.getAccessibleTicket(access, id);
    return this.replyService.create(access, ticket, dto, req);
  }

  @Get(':id/replies')
  @ApiOperation({
    summary: 'List replies for a ticket (internal notes hidden from customers)',
  })
  @ApiParam({ name: 'id', type: 'string' })
  @ApiResponse({ status: 200, description: 'Replies returned' })
  async listReplies(
    @Access() access: TicketAccess,
    @Param('id') id: string,
    @Query() pagination: PaginationQueryDto,
  ) {
    const ticket = await this.ticketService.getAccessibleTicket(access, id);
    return this.replyService.list(access, ticket, pagination);
  }

  @Delete('replies/:replyId')
  @ApiOperation({ summary: 'Delete a reply' })
  @ApiParam({ name: 'replyId', type: 'string' })
  @ApiResponse({ status: 200, description: 'Reply deleted' })
  async deleteReply(
    @Access() access: TicketAccess,
    @Param('replyId') replyId: string,
    @Req() req: Request,
  ) {
    const ticket = await this.ticketService.getTicketForReply(access, replyId);
    return this.replyService.remove(access, ticket, replyId, req);
  }

  @Post(':id/attachments')
  @ApiOperation({ summary: 'Upload attachments / evidence to a ticket' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: UploadAttachmentDto })
  @ApiParam({ name: 'id', type: 'string' })
  @ApiResponse({ status: 201, description: 'Attachments uploaded' })
  @UseInterceptors(FilesInterceptor('files', 10))
  async uploadAttachments(
    @Access() access: TicketAccess,
    @Param('id') id: string,
    @UploadedFiles() files: UploadedFile[],
    @Req() req: Request,
    @Body('isEvidence') isEvidence?: string,
  ) {
    const ticket = await this.ticketService.getAccessibleTicket(access, id);
    return this.attachmentService.upload(
      access,
      ticket,
      files,
      isEvidence === 'true',
      req,
    );
  }

  @Post(':id/watchers')
  @ApiOperation({ summary: 'Watch a ticket' })
  @ApiParam({ name: 'id', type: 'string' })
  @ApiResponse({ status: 201, description: 'Now watching ticket' })
  async watch(
    @Access() access: TicketAccess,
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    const ticket = await this.ticketService.getAccessibleTicket(access, id);
    return this.watcherService.add(access, ticket, req);
  }

  @Delete(':id/watchers/:watcherId')
  @ApiOperation({ summary: 'Remove a watcher from a ticket' })
  @ApiParam({ name: 'id', type: 'string' })
  @ApiParam({ name: 'watcherId', type: 'string' })
  @ApiResponse({ status: 200, description: 'Watcher removed' })
  async unwatch(
    @Access() access: TicketAccess,
    @Param('id') id: string,
    @Param('watcherId') watcherId: string,
    @Req() req: Request,
  ) {
    const ticket = await this.ticketService.getAccessibleTicket(access, id);
    return this.watcherService.remove(access, ticket, watcherId, req);
  }

  @Post(':id/tags')
  @ApiOperation({ summary: 'Assign or create a tag on a ticket' })
  @ApiParam({ name: 'id', type: 'string' })
  @ApiBody({ type: AssignTagDto })
  @ApiResponse({ status: 201, description: 'Tag assigned' })
  async addTag(
    @Access() access: TicketAccess,
    @Param('id') id: string,
    @Body() dto: AssignTagDto,
    @Req() req: Request,
  ) {
    const ticket = await this.ticketService.getAccessibleTicket(access, id);
    return this.tagService.add(access, ticket, dto, req);
  }

  @Delete(':id/tags/:tagId')
  @ApiOperation({ summary: 'Remove a tag from a ticket' })
  @ApiParam({ name: 'id', type: 'string' })
  @ApiParam({ name: 'tagId', type: 'string' })
  @ApiResponse({ status: 200, description: 'Tag removed' })
  async removeTag(
    @Access() access: TicketAccess,
    @Param('id') id: string,
    @Param('tagId') tagId: string,
    @Req() req: Request,
  ) {
    const ticket = await this.ticketService.getAccessibleTicket(access, id);
    return this.tagService.remove(access, ticket, tagId, req);
  }
}
