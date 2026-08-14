import {
  Body,
  BadRequestException,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequestContextService } from '../request-context/request-context.service';
import type { Request } from 'express';
import type { CustomerRequestUser } from '../customer/types/customer-user.type';
import { KnowledgeBaseService } from '../customer/services/knowledge-base.service';
import { KnowledgeArticleQueryDto } from './dto/knowledge-article-query.dto';
import { CreateKnowledgeCategoryDto } from './dto/create-knowledge-category.dto';
import { UpdateKnowledgeCategoryDto } from './dto/update-knowledge-category.dto';
import { CreateKnowledgeArticleDto } from './dto/create-knowledge-article.dto';
import { UpdateKnowledgeArticleDto } from './dto/update-knowledge-article.dto';
import { KnowledgeArticleCommentDto } from './dto/knowledge-article-comment.dto';
import { VoteArticleDto } from '../customer/dto/vote-article.dto';

const MANAGEMENT_ROLES = ['PLATFORM_ADMIN', 'TENANT_OWNER', 'SUPPORT_AGENT'];

@ApiTags('Knowledge Base')
@ApiBearerAuth()
@Controller('knowledge')
export class KnowledgeController {
  constructor(
    private readonly knowledgeBaseService: KnowledgeBaseService,
    private readonly requestContextService: RequestContextService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get knowledge base overview' })
  async getOverview() {
    const organizationId = this.resolveOrganizationId();
    return this.knowledgeBaseService.getKnowledgeBase(organizationId);
  }

  @Get('categories')
  @ApiOperation({ summary: 'List knowledge base categories' })
  async getCategories() {
    const organizationId = this.resolveOrganizationId();
    return this.knowledgeBaseService.getCategories(organizationId, false);
  }

  @Post('categories')
  @Roles(...MANAGEMENT_ROLES)
  @ApiOperation({ summary: 'Create a knowledge base category' })
  @ApiBody({ type: CreateKnowledgeCategoryDto })
  async createCategory(
    @CurrentUser() user: CustomerRequestUser,
    @Body() dto: CreateKnowledgeCategoryDto,
    @Req() req: Request,
  ) {
    return this.knowledgeBaseService.createCategory(
      user.organizationId,
      user,
      dto,
      req,
    );
  }

  @Patch('categories/:id')
  @Roles(...MANAGEMENT_ROLES)
  @ApiOperation({ summary: 'Update a knowledge base category' })
  @ApiParam({ name: 'id', type: 'string' })
  @ApiBody({ type: UpdateKnowledgeCategoryDto })
  async updateCategory(
    @CurrentUser() user: CustomerRequestUser,
    @Param('id') id: string,
    @Body() dto: UpdateKnowledgeCategoryDto,
    @Req() req: Request,
  ) {
    return this.knowledgeBaseService.updateCategory(
      user.organizationId,
      user,
      id,
      dto,
      req,
    );
  }

  @Delete('categories/:id')
  @Roles(...MANAGEMENT_ROLES)
  @ApiOperation({ summary: 'Delete a knowledge base category' })
  @ApiParam({ name: 'id', type: 'string' })
  async deleteCategory(
    @CurrentUser() user: CustomerRequestUser,
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    return this.knowledgeBaseService.deleteCategory(
      user.organizationId,
      user,
      id,
      req,
    );
  }

  @Get('articles')
  @ApiOperation({ summary: 'List and search knowledge articles' })
  async listArticles(
    @CurrentUser() user: CustomerRequestUser | null,
    @Query() query: KnowledgeArticleQueryDto,
  ) {
    const organizationId = this.resolveOrganizationId();
    return this.knowledgeBaseService.listArticles(
      organizationId,
      query,
      this.canManage(user),
    );
  }

  @Get('search')
  @ApiOperation({ summary: 'Search knowledge articles' })
  async searchArticles(
    @CurrentUser() user: CustomerRequestUser | null,
    @Query() query: KnowledgeArticleQueryDto,
  ) {
    const organizationId = this.resolveOrganizationId();
    return this.knowledgeBaseService.searchArticles(
      organizationId,
      query,
      this.canManage(user),
    );
  }

  @Get('articles/:id')
  @ApiOperation({ summary: 'Get a knowledge article' })
  @ApiParam({ name: 'id', type: 'string' })
  async getArticle(
    @CurrentUser() user: CustomerRequestUser | null,
    @Param('id') id: string,
  ) {
    const organizationId = this.resolveOrganizationId();
    return this.knowledgeBaseService.getArticle(
      organizationId,
      id,
      user?.userId,
      this.canManage(user),
    );
  }

  @Post('articles')
  @Roles(...MANAGEMENT_ROLES)
  @ApiOperation({ summary: 'Create a knowledge article' })
  @ApiBody({ type: CreateKnowledgeArticleDto })
  async createArticle(
    @CurrentUser() user: CustomerRequestUser,
    @Body() dto: CreateKnowledgeArticleDto,
    @Req() req: Request,
  ) {
    return this.knowledgeBaseService.createArticle(
      user.organizationId,
      user,
      dto,
      req,
    );
  }

  @Patch('articles/:id')
  @Roles(...MANAGEMENT_ROLES)
  @ApiOperation({ summary: 'Update a knowledge article' })
  @ApiParam({ name: 'id', type: 'string' })
  @ApiBody({ type: UpdateKnowledgeArticleDto })
  async updateArticle(
    @CurrentUser() user: CustomerRequestUser,
    @Param('id') id: string,
    @Body() dto: UpdateKnowledgeArticleDto,
    @Req() req: Request,
  ) {
    return this.knowledgeBaseService.updateArticle(
      user.organizationId,
      user,
      id,
      dto,
      req,
    );
  }

  @Delete('articles/:id')
  @Roles(...MANAGEMENT_ROLES)
  @ApiOperation({ summary: 'Delete a knowledge article' })
  @ApiParam({ name: 'id', type: 'string' })
  async deleteArticle(
    @CurrentUser() user: CustomerRequestUser,
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    return this.knowledgeBaseService.deleteArticle(
      user.organizationId,
      user,
      id,
      req,
    );
  }

  @Post('articles/:id/publish')
  @Roles(...MANAGEMENT_ROLES)
  @ApiOperation({ summary: 'Publish a knowledge article' })
  @ApiParam({ name: 'id', type: 'string' })
  async publishArticle(
    @CurrentUser() user: CustomerRequestUser,
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    return this.knowledgeBaseService.publishArticle(
      user.organizationId,
      user,
      id,
      req,
    );
  }

  @Post('articles/:id/archive')
  @Roles(...MANAGEMENT_ROLES)
  @ApiOperation({ summary: 'Archive a knowledge article' })
  @ApiParam({ name: 'id', type: 'string' })
  async archiveArticle(
    @CurrentUser() user: CustomerRequestUser,
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    return this.knowledgeBaseService.archiveArticle(
      user.organizationId,
      user,
      id,
      req,
    );
  }

  @Post('articles/:id/restore')
  @Roles(...MANAGEMENT_ROLES)
  @ApiOperation({ summary: 'Restore a knowledge article' })
  @ApiParam({ name: 'id', type: 'string' })
  async restoreArticle(
    @CurrentUser() user: CustomerRequestUser,
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    return this.knowledgeBaseService.restoreArticle(
      user.organizationId,
      user,
      id,
      req,
    );
  }

  @Post('articles/:id/duplicate')
  @Roles(...MANAGEMENT_ROLES)
  @ApiOperation({ summary: 'Duplicate a knowledge article' })
  @ApiParam({ name: 'id', type: 'string' })
  async duplicateArticle(
    @CurrentUser() user: CustomerRequestUser,
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    return this.knowledgeBaseService.duplicateArticle(
      user.organizationId,
      user,
      id,
      req,
    );
  }

  @Get('articles/:id/comments')
  @ApiOperation({ summary: 'List article comments' })
  @ApiParam({ name: 'id', type: 'string' })
  async listComments(@Param('id') id: string) {
    const organizationId = this.resolveOrganizationId();
    return this.knowledgeBaseService.listComments(organizationId, id);
  }

  @Post('articles/:id/comments')
  @ApiOperation({ summary: 'Add a comment to a knowledge article' })
  @ApiParam({ name: 'id', type: 'string' })
  @ApiBody({ type: KnowledgeArticleCommentDto })
  async addComment(
    @CurrentUser() user: CustomerRequestUser,
    @Param('id') id: string,
    @Body() dto: KnowledgeArticleCommentDto,
    @Req() req: Request,
  ) {
    return this.knowledgeBaseService.addComment(
      user.organizationId,
      user.userId,
      id,
      dto,
      user,
      req,
    );
  }

  @Post('articles/:id/vote')
  @ApiOperation({ summary: 'Vote whether an article was helpful' })
  @ApiParam({ name: 'id', type: 'string' })
  @ApiBody({ type: VoteArticleDto })
  async voteArticle(
    @CurrentUser() user: CustomerRequestUser,
    @Param('id') id: string,
    @Body() dto: VoteArticleDto,
    @Req() req: Request,
  ) {
    return this.knowledgeBaseService.voteArticle(
      user.organizationId,
      user.userId,
      id,
      dto,
      req,
    );
  }

  @Get('articles/:id/versions')
  @Roles(...MANAGEMENT_ROLES)
  @ApiOperation({ summary: 'List article versions' })
  @ApiParam({ name: 'id', type: 'string' })
  async listVersions(
    @CurrentUser() user: CustomerRequestUser,
    @Param('id') id: string,
  ) {
    return this.knowledgeBaseService.listVersions(user.organizationId, id);
  }

  @Get('articles/:id/feedback')
  @Roles(...MANAGEMENT_ROLES)
  @ApiOperation({ summary: 'List article feedback entries' })
  @ApiParam({ name: 'id', type: 'string' })
  async listFeedback(
    @CurrentUser() user: CustomerRequestUser,
    @Param('id') id: string,
  ) {
    return this.knowledgeBaseService.listFeedback(user.organizationId, id);
  }

  private resolveOrganizationId() {
    const current = this.requestContextService.getCurrentOrganizationId();
    if (!current) {
      throw new BadRequestException(
        'Unable to resolve organization for the current request.',
      );
    }
    return current;
  }

  private canManage(user: CustomerRequestUser | null) {
    if (!user?.role) {
      return false;
    }
    return MANAGEMENT_ROLES.includes(user.role);
  }
}
