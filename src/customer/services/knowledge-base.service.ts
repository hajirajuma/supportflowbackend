import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PaginationUtil } from '../../common/utils/pagination.util';
import {
  AuditLogService,
  AUDIT_ACTIONS,
} from '../../audit-log/audit-log.service';
import { KnowledgeBaseSearchDto } from '../dto/knowledge-base-search.dto';
import { VoteArticleDto } from '../dto/vote-article.dto';
import { KnowledgeArticleQueryDto } from '../../knowledge/dto/knowledge-article-query.dto';
import { CreateKnowledgeCategoryDto } from '../../knowledge/dto/create-knowledge-category.dto';
import { UpdateKnowledgeCategoryDto } from '../../knowledge/dto/update-knowledge-category.dto';
import { CreateKnowledgeArticleDto } from '../../knowledge/dto/create-knowledge-article.dto';
import { UpdateKnowledgeArticleDto } from '../../knowledge/dto/update-knowledge-article.dto';
import { KnowledgeArticleCommentDto } from '../../knowledge/dto/knowledge-article-comment.dto';
import type { Request } from 'express';

const PUBLIC_ARTICLE_FILTER = {
  status: 'PUBLISHED',
  visibility: 'PUBLIC',
};

type Actor = {
  userId: string;
  email?: string | null;
  name?: string | null;
  role?: string | null;
};

type KnowledgeMetadata = Record<string, any>;

@Injectable()
export class KnowledgeBaseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async getKnowledgeBase(organizationId: string) {
    const [
      organization,
      settings,
      categories,
      recentArticles,
      popularArticles,
    ] = await Promise.all([
      (this.prisma as any).organization.findUnique({
        where: { id: organizationId },
        select: {
          id: true,
          name: true,
          slug: true,
          website: true,
          logo: true,
        },
      }),
      (this.prisma as any).organizationSettings.findUnique({
        where: { organizationId },
        select: {
          knowledgeBaseEnabled: true,
          portalTitle: true,
          portalLogo: true,
          portalFooter: true,
          portalTheme: true,
          branding: true,
          primaryColor: true,
          secondaryColor: true,
          brandLogo: true,
          brandFavicon: true,
          supportEmail: true,
          supportPhone: true,
        },
      }),
      this.getCategories(organizationId, false),
      this.listArticlesInternal(organizationId, {
        search: undefined,
        categoryId: undefined,
        page: 1,
        limit: 6,
        sortBy: 'publishedAt',
        sortOrder: 'desc',
      }),
      this.listArticlesInternal(organizationId, {
        search: undefined,
        categoryId: undefined,
        page: 1,
        limit: 6,
        sortBy: 'views',
        sortOrder: 'desc',
      }),
    ]);

    return {
      organization: {
        id: organization?.id ?? organizationId,
        name: organization?.name ?? null,
        slug: organization?.slug ?? null,
        website: organization?.website ?? null,
        logo: organization?.logo ?? null,
      },
      settings,
      knowledgeBaseEnabled: settings?.knowledgeBaseEnabled ?? true,
      categories,
      recentArticles: recentArticles.items,
      popularArticles: popularArticles.items,
      stats: {
        totalCategories: categories.length,
        totalArticles: recentArticles.total,
      },
    };
  }

  async getCategories(organizationId: string, includeInactive = false) {
    const categories = await (this.prisma as any).knowledgeCategory.findMany({
      where: {
        organizationId,
        ...(includeInactive ? {} : { isActive: true }),
      },
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
      include: {
        _count: {
          select: {
            articles: {
              where: PUBLIC_ARTICLE_FILTER,
            },
          },
        },
      },
    });

    return categories.map((category: any) => this.serializeCategory(category));
  }

  async createCategory(
    organizationId: string,
    actor: Actor,
    dto: CreateKnowledgeCategoryDto,
    request?: Request,
  ) {
    if (dto.parentId) {
      await this.ensureCategory(organizationId, dto.parentId);
    }

    const nextOrder = await this.getNextCategoryOrder(organizationId);

    const category = await (this.prisma as any).knowledgeCategory.create({
      data: {
        name: dto.name.trim(),
        description: dto.description?.trim() ?? null,
        parentId: dto.parentId ?? null,
        order: dto.order ?? nextOrder,
        isActive: dto.isActive ?? true,
        organizationId,
      },
    });

    await this.auditLogService.record({
      organizationId,
      actorId: actor.userId,
      actorEmail: actor.email ?? undefined,
      actorName: actor.name ?? undefined,
      action: AUDIT_ACTIONS.CREATE,
      entityType: 'KnowledgeCategory',
      entityId: category.id,
      metadata: {
        name: category.name,
        parentId: category.parentId,
      },
      request,
    });

    return this.serializeCategory(category);
  }

  async updateCategory(
    organizationId: string,
    actor: Actor,
    categoryId: string,
    dto: UpdateKnowledgeCategoryDto,
    request?: Request,
  ) {
    const category = await this.ensureCategory(organizationId, categoryId);
    if (dto.parentId) {
      await this.ensureCategory(organizationId, dto.parentId);
    }
    const updated = await (this.prisma as any).knowledgeCategory.update({
      where: { id: category.id },
      data: {
        name: dto.name?.trim() ?? undefined,
        description:
          dto.description === undefined
            ? undefined
            : (dto.description?.trim() ?? null),
        parentId: dto.parentId === undefined ? undefined : dto.parentId,
        order: dto.order ?? undefined,
        isActive: dto.isActive ?? undefined,
      },
    });

    await this.auditLogService.record({
      organizationId,
      actorId: actor.userId,
      actorEmail: actor.email ?? undefined,
      actorName: actor.name ?? undefined,
      action: AUDIT_ACTIONS.UPDATE,
      entityType: 'KnowledgeCategory',
      entityId: updated.id,
      metadata: {
        name: updated.name,
        isActive: updated.isActive,
      },
      request,
    });

    return this.serializeCategory(updated);
  }

  async deleteCategory(
    organizationId: string,
    actor: Actor,
    categoryId: string,
    request?: Request,
  ) {
    const category = await this.ensureCategory(organizationId, categoryId);
    const activeArticleCount = await (
      this.prisma as any
    ).knowledgeArticle.count({
      where: {
        organizationId,
        categoryId: category.id,
        status: { not: 'ARCHIVED' },
      },
    });

    if (activeArticleCount > 0) {
      const updated = await (this.prisma as any).knowledgeCategory.update({
        where: { id: category.id },
        data: { isActive: false },
      });

      await this.auditLogService.record({
        organizationId,
        actorId: actor.userId,
        actorEmail: actor.email ?? undefined,
        actorName: actor.name ?? undefined,
        action: AUDIT_ACTIONS.DELETE,
        entityType: 'KnowledgeCategory',
        entityId: updated.id,
        metadata: {
          archived: true,
          reason: 'Category has articles and was soft-deleted',
        },
        request,
      });

      return {
        deleted: true,
        softDeleted: true,
        category: this.serializeCategory(updated),
      };
    }

    await (this.prisma as any).knowledgeCategory.delete({
      where: { id: category.id },
    });

    await this.auditLogService.record({
      organizationId,
      actorId: actor.userId,
      actorEmail: actor.email ?? undefined,
      actorName: actor.name ?? undefined,
      action: AUDIT_ACTIONS.DELETE,
      entityType: 'KnowledgeCategory',
      entityId: category.id,
      metadata: { name: category.name },
      request,
    });

    return { deleted: true, softDeleted: false };
  }

  async listArticles(
    organizationId: string,
    query: KnowledgeArticleQueryDto | KnowledgeBaseSearchDto,
    canManage = false,
  ) {
    return this.listArticlesInternal(organizationId, query, canManage);
  }

  async searchArticles(
    organizationId: string,
    query: KnowledgeArticleQueryDto | KnowledgeBaseSearchDto,
    canManage = false,
  ) {
    return this.listArticlesInternal(organizationId, query, canManage);
  }

  async getArticle(
    organizationId: string,
    articleId: string,
    userId?: string,
    canManage = false,
  ) {
    const article = await this.findArticle(
      organizationId,
      articleId,
      canManage,
    );

    if (!canManage) {
      await (this.prisma as any).knowledgeArticle.update({
        where: { id: article.id },
        data: { views: { increment: 1 } },
      });
      article.views += 1;
    }

    const [feedback, comments, versions, attachments, relatedArticles] =
      await Promise.all([
        userId
          ? (this.prisma as any).knowledgeArticleFeedback.findUnique({
              where: { articleId_userId: { articleId: article.id, userId } },
              select: {
                id: true,
                isHelpful: true,
                comment: true,
                createdAt: true,
                updatedAt: true,
              },
            })
          : Promise.resolve(null),
        this.getArticleComments(article),
        Promise.resolve(this.getArticleVersions(article)),
        this.resolveArticleAttachments(article),
        this.getRelatedArticles(organizationId, article),
      ]);

    return this.serializeArticleDetail({
      article,
      feedback,
      comments,
      versions,
      attachments,
      relatedArticles,
    });
  }

  async createArticle(
    organizationId: string,
    actor: Actor,
    dto: CreateKnowledgeArticleDto,
    request?: Request,
  ) {
    if (!dto.title?.trim() || !dto.content?.trim()) {
      throw new BadRequestException('Title and content are required.');
    }

    if (dto.categoryId) {
      await this.ensureCategory(organizationId, dto.categoryId);
    }

    const slug = await this.ensureUniqueArticleSlug(
      organizationId,
      dto.slug?.trim() || this.slugify(dto.title),
    );

    const tags = await this.resolveTags(organizationId, dto.tags ?? []);
    const attachments = await this.resolveAttachmentsByIds(
      organizationId,
      dto.attachmentIds ?? [],
    );
    const metadata = this.normalizeMetadata(dto.metadata);

    metadata.relatedArticleIds = this.normalizeIdList(dto.relatedArticleIds);
    metadata.attachments = attachments;
    metadata.versions = [
      {
        version: 1,
        title: dto.title.trim(),
        excerpt: dto.excerpt?.trim() ?? null,
        content: dto.content,
        createdAt: new Date().toISOString(),
        createdById: actor.userId,
      },
    ];
    metadata.seoTitle = dto.seoTitle?.trim() ?? null;
    metadata.seoDescription = dto.seoDescription?.trim() ?? null;

    const article = await (this.prisma as any).knowledgeArticle.create({
      data: {
        title: dto.title.trim(),
        slug,
        content: dto.content,
        excerpt: dto.excerpt?.trim() ?? null,
        organizationId,
        categoryId: dto.categoryId ?? null,
        status: dto.status ?? 'DRAFT',
        visibility: dto.visibility ?? 'PUBLIC',
        createdById: actor.userId,
        updatedById: actor.userId,
        publishedAt: dto.status === 'PUBLISHED' ? new Date() : null,
        metadata,
        tags: {
          create: tags.map((tagId) => ({
            tagId,
          })),
        },
      },
      include: this.articleInclude(),
    });

    await this.auditLogService.record({
      organizationId,
      actorId: actor.userId,
      actorEmail: actor.email ?? undefined,
      actorName: actor.name ?? undefined,
      action: AUDIT_ACTIONS.CREATE,
      entityType: 'KnowledgeArticle',
      entityId: article.id,
      metadata: {
        title: article.title,
        slug: article.slug,
        categoryId: article.categoryId,
        status: article.status,
      },
      request,
    });

    return this.serializeArticle(article);
  }

  async updateArticle(
    organizationId: string,
    actor: Actor,
    articleId: string,
    dto: UpdateKnowledgeArticleDto,
    request?: Request,
  ) {
    const current = await this.findArticle(organizationId, articleId, true);
    if (dto.categoryId) {
      await this.ensureCategory(organizationId, dto.categoryId);
    }
    const metadata = this.normalizeMetadata(current.metadata);
    const versions = Array.isArray(metadata.versions)
      ? [...metadata.versions]
      : [];
    versions.push({
      version: versions.length + 1,
      title: current.title,
      excerpt: current.excerpt ?? null,
      content: current.content,
      categoryId: current.categoryId,
      status: current.status,
      visibility: current.visibility,
      updatedAt: new Date().toISOString(),
      updatedById: actor.userId,
    });

    const title = dto.title?.trim() ?? current.title;
    const slug =
      dto.slug?.trim() ||
      (dto.title
        ? await this.ensureUniqueArticleSlug(
            organizationId,
            this.slugify(title),
            current.id,
          )
        : current.slug);

    const tags = dto.tags
      ? await this.resolveTags(organizationId, dto.tags)
      : null;
    const attachments =
      dto.attachmentIds !== undefined
        ? await this.resolveAttachmentsByIds(organizationId, dto.attachmentIds)
        : undefined;

    const updatedMetadata: Record<string, unknown> = {
      ...metadata,
      ...this.normalizeMetadata(dto.metadata),
      versions,
    };

    if (dto.relatedArticleIds !== undefined) {
      updatedMetadata.relatedArticleIds = this.normalizeIdList(
        dto.relatedArticleIds,
      );
    }
    if (attachments !== undefined) {
      updatedMetadata.attachments = attachments;
    }
    if (dto.seoTitle !== undefined) {
      updatedMetadata.seoTitle = dto.seoTitle?.trim() ?? null;
    }
    if (dto.seoDescription !== undefined) {
      updatedMetadata.seoDescription = dto.seoDescription?.trim() ?? null;
    }

    const updated = await (this.prisma as any).knowledgeArticle.update({
      where: { id: current.id },
      data: {
        title,
        slug,
        content: dto.content ?? current.content,
        excerpt:
          dto.excerpt === undefined ? undefined : (dto.excerpt?.trim() ?? null),
        categoryId: dto.categoryId === undefined ? undefined : dto.categoryId,
        status: dto.status ?? undefined,
        visibility: dto.visibility ?? undefined,
        updatedById: actor.userId,
        publishedAt:
          dto.status === 'PUBLISHED' && !current.publishedAt
            ? new Date()
            : undefined,
        metadata: updatedMetadata,
        tags: tags
          ? {
              deleteMany: {},
              create: tags.map((tagId) => ({ tagId })),
            }
          : undefined,
      },
      include: this.articleInclude(),
    });

    await this.auditLogService.record({
      organizationId,
      actorId: actor.userId,
      actorEmail: actor.email ?? undefined,
      actorName: actor.name ?? undefined,
      action: AUDIT_ACTIONS.UPDATE,
      entityType: 'KnowledgeArticle',
      entityId: updated.id,
      metadata: {
        title: updated.title,
        slug: updated.slug,
        categoryId: updated.categoryId,
        status: updated.status,
      },
      request,
    });

    return this.serializeArticle(updated);
  }

  async deleteArticle(
    organizationId: string,
    actor: Actor,
    articleId: string,
    request?: Request,
  ) {
    const article = await this.findArticle(organizationId, articleId, true);
    await (this.prisma as any).knowledgeArticle.delete({
      where: { id: article.id },
    });

    await this.auditLogService.record({
      organizationId,
      actorId: actor.userId,
      actorEmail: actor.email ?? undefined,
      actorName: actor.name ?? undefined,
      action: AUDIT_ACTIONS.DELETE,
      entityType: 'KnowledgeArticle',
      entityId: article.id,
      metadata: { title: article.title, slug: article.slug },
      request,
    });

    return { deleted: true };
  }

  async publishArticle(
    organizationId: string,
    actor: Actor,
    articleId: string,
    request?: Request,
  ) {
    const article = await this.findArticle(organizationId, articleId, true);
    const updated = await (this.prisma as any).knowledgeArticle.update({
      where: { id: article.id },
      data: {
        status: 'PUBLISHED',
        publishedAt: article.publishedAt ?? new Date(),
        updatedById: actor.userId,
      },
      include: this.articleInclude(),
    });

    await this.auditLogService.record({
      organizationId,
      actorId: actor.userId,
      actorEmail: actor.email ?? undefined,
      actorName: actor.name ?? undefined,
      action: AUDIT_ACTIONS.UPDATE,
      entityType: 'KnowledgeArticle',
      entityId: updated.id,
      metadata: { action: 'publish' },
      request,
    });

    return this.serializeArticle(updated);
  }

  async archiveArticle(
    organizationId: string,
    actor: Actor,
    articleId: string,
    request?: Request,
  ) {
    const article = await this.findArticle(organizationId, articleId, true);
    const updated = await (this.prisma as any).knowledgeArticle.update({
      where: { id: article.id },
      data: {
        status: 'ARCHIVED',
        updatedById: actor.userId,
      },
      include: this.articleInclude(),
    });

    await this.auditLogService.record({
      organizationId,
      actorId: actor.userId,
      actorEmail: actor.email ?? undefined,
      actorName: actor.name ?? undefined,
      action: AUDIT_ACTIONS.UPDATE,
      entityType: 'KnowledgeArticle',
      entityId: updated.id,
      metadata: { action: 'archive' },
      request,
    });

    return this.serializeArticle(updated);
  }

  async restoreArticle(
    organizationId: string,
    actor: Actor,
    articleId: string,
    request?: Request,
  ) {
    const article = await this.findArticle(organizationId, articleId, true);
    const updated = await (this.prisma as any).knowledgeArticle.update({
      where: { id: article.id },
      data: {
        status: article.publishedAt ? 'PUBLISHED' : 'DRAFT',
        updatedById: actor.userId,
      },
      include: this.articleInclude(),
    });

    await this.auditLogService.record({
      organizationId,
      actorId: actor.userId,
      actorEmail: actor.email ?? undefined,
      actorName: actor.name ?? undefined,
      action: AUDIT_ACTIONS.UPDATE,
      entityType: 'KnowledgeArticle',
      entityId: updated.id,
      metadata: { action: 'restore' },
      request,
    });

    return this.serializeArticle(updated);
  }

  async duplicateArticle(
    organizationId: string,
    actor: Actor,
    articleId: string,
    request?: Request,
  ) {
    const article = await this.findArticle(organizationId, articleId, true);
    const metadata = this.normalizeMetadata(article.metadata);
    const newSlug = await this.ensureUniqueArticleSlug(
      organizationId,
      `${article.slug}-copy`,
    );
    const duplicated = await (this.prisma as any).knowledgeArticle.create({
      data: {
        title: `${article.title} Copy`,
        slug: newSlug,
        content: article.content,
        excerpt: article.excerpt,
        organizationId,
        categoryId: article.categoryId,
        status: 'DRAFT',
        visibility: article.visibility,
        createdById: actor.userId,
        updatedById: actor.userId,
        metadata: {
          ...metadata,
          duplicatedFromId: article.id,
          versions: [],
        },
        tags: {
          create: Array.isArray(article.tags)
            ? article.tags.map((item: any) => ({
                tagId: item.tag?.id ?? item.tagId,
              }))
            : [],
        },
      },
      include: this.articleInclude(),
    });

    await this.auditLogService.record({
      organizationId,
      actorId: actor.userId,
      actorEmail: actor.email ?? undefined,
      actorName: actor.name ?? undefined,
      action: AUDIT_ACTIONS.CREATE,
      entityType: 'KnowledgeArticle',
      entityId: duplicated.id,
      metadata: { duplicatedFromId: article.id },
      request,
    });

    return this.serializeArticle(duplicated);
  }

  async voteArticle(
    organizationId: string,
    userId: string,
    articleId: string,
    dto: VoteArticleDto,
    request?: Request,
  ) {
    const article = await this.findArticle(organizationId, articleId, false);
    const existing = await (
      this.prisma as any
    ).knowledgeArticleFeedback.findUnique({
      where: { articleId_userId: { articleId: article.id, userId } },
    });

    let helpfulDelta = 0;
    let notHelpfulDelta = 0;

    if (existing) {
      if (existing.isHelpful) {
        helpfulDelta -= 1;
      } else {
        notHelpfulDelta -= 1;
      }
      if (existing.isHelpful === dto.isHelpful && existing.comment === null) {
        return this.buildVoteResponse(article, existing);
      }
    }

    if (dto.isHelpful) {
      helpfulDelta += 1;
    } else {
      notHelpfulDelta += 1;
    }

    const [feedback] = await (this.prisma as any).$transaction([
      (this.prisma as any).knowledgeArticleFeedback.upsert({
        where: { articleId_userId: { articleId: article.id, userId } },
        update: { isHelpful: dto.isHelpful },
        create: {
          articleId: article.id,
          userId,
          isHelpful: dto.isHelpful,
          comment: null,
        },
      }),
      (this.prisma as any).knowledgeArticle.update({
        where: { id: article.id },
        data: {
          helpfulCount: { increment: helpfulDelta },
          notHelpfulCount: { increment: notHelpfulDelta },
          likes: helpfulDelta !== 0 ? { increment: helpfulDelta } : undefined,
        },
      }),
    ]);

    await this.auditLogService.record({
      organizationId,
      actorId: userId,
      action: AUDIT_ACTIONS.UPDATE,
      entityType: 'KnowledgeArticleFeedback',
      entityId: feedback.id,
      metadata: {
        articleId: article.id,
        isHelpful: dto.isHelpful,
      },
      request,
    });

    return this.buildVoteResponse(
      {
        ...article,
        helpfulCount: Math.max(0, article.helpfulCount + helpfulDelta),
        notHelpfulCount: Math.max(0, article.notHelpfulCount + notHelpfulDelta),
      },
      feedback,
    );
  }

  async addComment(
    organizationId: string,
    userId: string,
    articleId: string,
    dto: KnowledgeArticleCommentDto,
    actor: Actor,
    request?: Request,
  ) {
    const article = await this.findArticle(organizationId, articleId, false);
    const metadata = this.normalizeMetadata(article.metadata);
    const comments = Array.isArray(metadata.comments)
      ? [...metadata.comments]
      : [];
    const comment = {
      id: `comment_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      userId,
      userName: actor.name ?? actor.email ?? null,
      body: dto.comment.trim(),
      createdAt: new Date().toISOString(),
    };
    comments.push(comment);

    await (this.prisma as any).knowledgeArticle.update({
      where: { id: article.id },
      data: {
        metadata: {
          ...metadata,
          comments,
        },
      },
    });

    await this.auditLogService.record({
      organizationId,
      actorId: userId,
      actorEmail: actor.email ?? undefined,
      actorName: actor.name ?? undefined,
      action: AUDIT_ACTIONS.UPDATE,
      entityType: 'KnowledgeArticleComment',
      entityId: article.id,
      metadata: { commentId: comment.id },
      request,
    });

    return comment;
  }

  async listComments(organizationId: string, articleId: string) {
    const article = await this.findArticle(organizationId, articleId, true);
    return this.getArticleComments(article);
  }

  async listVersions(organizationId: string, articleId: string) {
    const article = await this.findArticle(organizationId, articleId, true);
    return this.getArticleVersions(article);
  }

  async listFeedback(organizationId: string, articleId: string) {
    const article = await this.findArticle(organizationId, articleId, true);
    return (this.prisma as any).knowledgeArticleFeedback.findMany({
      where: { articleId: article.id },
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });
  }

  async getCategoryArticles(organizationId: string, categoryId: string) {
    await this.ensureCategory(organizationId, categoryId);
    return this.listArticlesInternal(organizationId, {
      categoryId,
      page: 1,
      limit: 20,
      sortBy: 'publishedAt',
      sortOrder: 'desc',
    });
  }

  private async listArticlesInternal(
    organizationId: string,
    query: Partial<KnowledgeArticleQueryDto & KnowledgeBaseSearchDto>,
    canManage = false,
  ) {
    const page = PaginationUtil.normalizePage(query.page);
    const limit = PaginationUtil.normalizeLimit(query.limit);
    const sortBy = query.sortBy ?? 'publishedAt';
    const sortOrder = query.sortOrder ?? 'desc';
    const where: any = {
      organizationId,
      ...(canManage
        ? {}
        : {
            status: 'PUBLISHED',
            visibility: 'PUBLIC',
          }),
    };

    if (!canManage && query.status) {
      where.status = 'PUBLISHED';
    } else if (query.status) {
      where.status = query.status;
    }

    if (query.visibility && canManage) {
      where.visibility = query.visibility;
    }

    if (query.categoryId) {
      where.categoryId = query.categoryId;
    }

    if (query.search) {
      where.OR = [
        { title: { contains: query.search, mode: 'insensitive' } },
        { excerpt: { contains: query.search, mode: 'insensitive' } },
        { content: { contains: query.search, mode: 'insensitive' } },
        {
          tags: {
            some: {
              tag: {
                name: { contains: query.search, mode: 'insensitive' },
              },
            },
          },
        },
      ];
    }

    if (query.tag && canManage) {
      where.tags = {
        some: {
          tag: {
            name: { contains: query.tag, mode: 'insensitive' },
          },
        },
      };
    }

    if (query.includeArchived !== true && !canManage) {
      where.status = 'PUBLISHED';
    }

    const orderBy: any =
      sortBy === 'views'
        ? { views: sortOrder }
        : sortBy === 'likes'
          ? { likes: sortOrder }
          : sortBy === 'updatedAt'
            ? { updatedAt: sortOrder }
            : sortBy === 'createdAt'
              ? { createdAt: sortOrder }
              : { publishedAt: sortOrder };

    const [items, total] = await Promise.all([
      (this.prisma as any).knowledgeArticle.findMany({
        where,
        orderBy,
        skip: PaginationUtil.getSkip(page, limit),
        take: limit,
        include: this.articleInclude(false),
      }),
      (this.prisma as any).knowledgeArticle.count({ where }),
    ]);

    return {
      items: items.map((article: any) => this.serializeArticle(article)),
      total,
      page,
      limit,
    };
  }

  private async findArticle(
    organizationId: string,
    articleId: string,
    canManage = false,
  ) {
    const article = await (this.prisma as any).knowledgeArticle.findFirst({
      where: {
        organizationId,
        OR: [{ id: articleId }, { slug: articleId }],
        ...(canManage
          ? {}
          : {
              status: 'PUBLISHED',
              visibility: 'PUBLIC',
            }),
      },
      include: this.articleInclude(),
    });

    if (!article) {
      throw new NotFoundException('Article not found');
    }

    return article;
  }

  private async ensureCategory(organizationId: string, categoryId: string) {
    const category = await (this.prisma as any).knowledgeCategory.findFirst({
      where: { id: categoryId, organizationId },
    });
    if (!category) {
      throw new NotFoundException('Category not found');
    }
    return category;
  }

  private async getNextCategoryOrder(organizationId: string) {
    const last = await (this.prisma as any).knowledgeCategory.aggregate({
      where: { organizationId },
      _max: { order: true },
    });
    return (last?._max?.order ?? 0) + 1;
  }

  private articleInclude(full = true) {
    return {
      category: {
        select: {
          id: true,
          name: true,
          description: true,
          isActive: true,
          order: true,
          parentId: true,
        },
      },
      tags: {
        include: {
          tag: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },
      ...(full
        ? {
            createdBy: {
              select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
              },
            },
            updatedBy: {
              select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
              },
            },
          }
        : {}),
    };
  }

  private serializeCategory(category: any) {
    return {
      id: category.id,
      name: category.name,
      description: category.description,
      parentId: category.parentId,
      order: category.order,
      isActive: category.isActive,
      slug: this.slugify(category.name),
      articleCount: category._count?.articles ?? 0,
      createdAt: category.createdAt,
      updatedAt: category.updatedAt,
    };
  }

  private serializeArticle(article: any) {
    const metadata = this.normalizeMetadata(article.metadata);
    const attachments = Array.isArray(metadata.attachments)
      ? metadata.attachments
      : [];
    const comments = Array.isArray(metadata.comments) ? metadata.comments : [];
    const versions = Array.isArray(metadata.versions) ? metadata.versions : [];

    return {
      id: article.id,
      title: article.title,
      slug: article.slug,
      content: article.content,
      excerpt: article.excerpt,
      categoryId: article.categoryId,
      category: article.category
        ? {
            id: article.category.id,
            name: article.category.name,
            description: article.category.description,
            isActive: article.category.isActive,
            order: article.category.order,
            parentId: article.category.parentId,
          }
        : null,
      status: article.status,
      visibility: article.visibility,
      views: article.views,
      likes: article.likes,
      helpfulCount: article.helpfulCount,
      notHelpfulCount: article.notHelpfulCount,
      tags: Array.isArray(article.tags)
        ? article.tags.map((tag: any) => ({
            id: tag.tag.id,
            name: tag.tag.name,
          }))
        : [],
      attachments,
      comments,
      versions,
      metadata,
      publishedAt: article.publishedAt,
      createdAt: article.createdAt,
      updatedAt: article.updatedAt,
      createdBy: article.createdBy ?? null,
      updatedBy: article.updatedBy ?? null,
    };
  }

  private serializeArticleDetail(payload: {
    article: any;
    feedback: any;
    comments: any[];
    versions: any[];
    attachments: any[];
    relatedArticles: any[];
  }) {
    const article = this.serializeArticle(payload.article);
    return {
      ...article,
      userFeedback: payload.feedback
        ? {
            id: payload.feedback.id,
            isHelpful: payload.feedback.isHelpful,
            comment: payload.feedback.comment,
            createdAt: payload.feedback.createdAt,
            updatedAt: payload.feedback.updatedAt,
          }
        : null,
      comments: payload.comments,
      versions: payload.versions,
      attachments: payload.attachments,
      relatedArticles: payload.relatedArticles,
    };
  }

  private buildVoteResponse(article: any, feedback: any) {
    return {
      articleId: article.id,
      isHelpful: feedback.isHelpful,
      helpfulCount: article.helpfulCount,
      notHelpfulCount: article.notHelpfulCount,
    };
  }

  private async resolveTags(organizationId: string, tags: string[]) {
    const normalized = this.normalizeIdList(tags);
    if (!normalized.length) {
      return [];
    }

    const existing = await (this.prisma as any).knowledgeTag.findMany({
      where: {
        organizationId,
        OR: normalized.map((name) => ({ name })),
      },
      select: { id: true, name: true },
    });

    const existingNames = new Set(
      existing.map((tag: any) => tag.name.toLowerCase()),
    );
    const created: any[] = [];

    for (const name of normalized) {
      if (existingNames.has(name.toLowerCase())) {
        continue;
      }
      created.push(
        await (this.prisma as any).knowledgeTag.create({
          data: {
            name,
            organizationId,
          },
          select: { id: true, name: true },
        }),
      );
    }

    return [...existing, ...created].map((tag: any) => tag.id);
  }

  private async resolveAttachmentsByIds(
    organizationId: string,
    attachmentIds: string[],
  ) {
    const normalized = this.normalizeIdList(attachmentIds);
    if (!normalized.length) {
      return [];
    }

    const files = await (this.prisma as any).fileUpload.findMany({
      where: {
        organizationId,
        id: { in: normalized },
      },
      select: {
        id: true,
        originalName: true,
        mimeType: true,
        fileSize: true,
        publicUrl: true,
      },
    });

    if (files.length !== normalized.length) {
      throw new BadRequestException(
        'One or more attachment files were not found.',
      );
    }

    return files.map((file: any) => ({
      id: file.id,
      name: file.originalName,
      mimeType: file.mimeType,
      size: file.fileSize,
      url: file.publicUrl,
    }));
  }

  private async resolveArticleAttachments(article: any) {
    const metadata = this.normalizeMetadata(article.metadata);
    const attachments = Array.isArray(metadata.attachments)
      ? metadata.attachments
      : [];
    return attachments;
  }

  private async getArticleComments(article: any) {
    const metadata = this.normalizeMetadata(article.metadata);
    const comments = Array.isArray(metadata.comments)
      ? [...metadata.comments]
      : [];
    comments.sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
    return comments;
  }

  private getArticleVersions(article: any) {
    const metadata = this.normalizeMetadata(article.metadata);
    const versions = Array.isArray(metadata.versions)
      ? [...metadata.versions]
      : [];
    versions.sort((a, b) => (a.version ?? 0) - (b.version ?? 0));
    return versions;
  }

  private async getRelatedArticles(organizationId: string, article: any) {
    const metadata = this.normalizeMetadata(article.metadata);
    const relatedIds = this.normalizeIdList(metadata.relatedArticleIds ?? []);
    const filteredRelatedIds = relatedIds.filter((id) => id !== article.id);
    const relatedWhere: any = {
      organizationId,
      status: 'PUBLISHED',
      visibility: 'PUBLIC',
    };

    if (filteredRelatedIds.length) {
      relatedWhere.id = { in: filteredRelatedIds };
    }

    const results = await (this.prisma as any).knowledgeArticle.findMany({
      where: relatedWhere,
      select: {
        id: true,
        title: true,
        slug: true,
        excerpt: true,
        views: true,
        publishedAt: true,
        category: { select: { id: true, name: true } },
      },
      take: 10,
    });

    if (results.length) {
      return results;
    }

    return (this.prisma as any).knowledgeArticle.findMany({
      where: {
        organizationId,
        categoryId: article.categoryId ?? undefined,
        ...(relatedIds.length
          ? { id: { in: relatedIds, not: article.id } }
          : { id: { not: article.id } }),
        status: 'PUBLISHED',
        visibility: 'PUBLIC',
      },
      select: {
        id: true,
        title: true,
        slug: true,
        excerpt: true,
        views: true,
        publishedAt: true,
        category: { select: { id: true, name: true } },
      },
      orderBy: { views: 'desc' },
      take: 5,
    });
  }

  private normalizeMetadata(metadata: unknown): KnowledgeMetadata {
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
      return {};
    }
    return { ...(metadata as Record<string, any>) };
  }

  private normalizeIdList(values: unknown) {
    if (!Array.isArray(values)) {
      return [];
    }
    return values
      .map((value) => String(value).trim())
      .filter((value) => value.length > 0);
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

  private async ensureUniqueArticleSlug(
    organizationId: string,
    baseSlug: string,
    excludeId?: string,
  ) {
    const normalizedBase = baseSlug || 'article';
    let candidate = normalizedBase;
    let index = 1;

    while (true) {
      const exists = await (this.prisma as any).knowledgeArticle.findFirst({
        where: {
          organizationId,
          slug: candidate,
          ...(excludeId ? { id: { not: excludeId } } : {}),
        },
        select: { id: true },
      });

      if (!exists) {
        return candidate;
      }

      candidate = `${normalizedBase}-${index}`;
      index += 1;
    }
  }
}
