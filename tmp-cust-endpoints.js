// Validates the remaining customer-portal queries (notifications, knowledge
// base, profile reads) against the compiled client. Validation runs before any
// DB round-trip, so unknown-field errors surface even with the DB unreachable.
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { PrismaPg } = require('@prisma/adapter-pg');
const { PrismaClient } = require('./dist/generated/prisma/client');

const ORG = 'org-test';
const USER = 'user-test';

const queries = [
  ['notification.listNotifications.findMany', (p) => p.notification.findMany({
    where: { userId: USER, organizationId: ORG },
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: {
      id: true, type: true, channel: true, title: true, body: true, data: true,
      relatedEntityType: true, relatedEntityId: true, isRead: true, readAt: true, createdAt: true,
    },
  })],
  ['notification.unreadCount.where', (p) => p.notification.count({ where: { userId: USER, organizationId: ORG, isRead: false } })],
  ['notification.emitUnreadCount.where', (p) => p.notification.count({ where: { userId: USER, isRead: false, isArchived: false } })],
  ['notification.markAllAsRead.updateMany', (p) => p.notification.updateMany({
    where: { userId: USER, organizationId: ORG, isRead: false },
    data: { isRead: true, readAt: new Date() },
  })],
  ['kb.getKnowledgeBase.organizationSettings', (p) => p.organizationSettings.findUnique({
    where: { organizationId: ORG },
    select: {
      knowledgeBaseEnabled: true, portalTitle: true, portalLogo: true, portalFooter: true,
      portalTheme: true, branding: true, primaryColor: true, secondaryColor: true,
      brandLogo: true, brandFavicon: true, supportEmail: true, supportPhone: true,
    },
  })],
  ['kb.getCategories.include', (p) => p.knowledgeCategory.findMany({
    where: { organizationId: ORG, isActive: true },
    include: { _count: { select: { articles: { where: { status: 'PUBLISHED', visibility: 'PUBLIC' } } } } },
  })],
  ['kb.listArticles.findMany', (p) => p.knowledgeArticle.findMany({
    where: { organizationId: ORG, status: 'PUBLISHED', visibility: 'PUBLIC' },
    take: 10,
    include: {
      category: { select: { id: true, name: true, description: true, isActive: true, order: true, parentId: true } },
      tags: { include: { tag: { select: { id: true, name: true } } } },
      createdBy: { select: { id: true, email: true, firstName: true, lastName: true } },
      updatedBy: { select: { id: true, email: true, firstName: true, lastName: true } },
    },
  })],
  ['kb.getArticle.findFirst', (p) => p.knowledgeArticle.findFirst({
    where: { organizationId: ORG, OR: [{ id: 'x' }, { slug: 'x' }], status: 'PUBLISHED', visibility: 'PUBLIC' },
    include: {
      category: { select: { id: true, name: true, description: true, isActive: true, order: true, parentId: true } },
      tags: { include: { tag: { select: { id: true, name: true } } } },
    },
  })],
  ['profile.findOwnedUser.findUnique', (p) => p.user.findUnique({ where: { id: USER } })],
];

(async () => {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL, max: 5 });
  const prisma = new PrismaClient({ adapter });

  for (const [name, run] of queries) {
    try {
      await run(prisma);
      console.log('OK   ', name);
    } catch (e) {
      const isValidation = e && e.constructor.name === 'PrismaClientValidationError';
      let detail = '';
      if (isValidation && e.message) {
        detail = e.message.split('\n').filter((l) => l.includes('Unknown argument')).join('; ').slice(0, 150);
      }
      console.log(isValidation ? 'VALIDATION-FAIL ' + name + ' | ' + detail : 'CONNECT-FAIL   ' + name + ' | ' + e.constructor.name);
    }
  }
  process.exit(0);
})();
