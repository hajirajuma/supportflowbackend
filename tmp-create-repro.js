// Validates every write query the ticket-create pipeline runs, against the
// compiled client the running backend uses. Argument validation runs before
// any DB round-trip, so unknown-field errors surface even with the DB
// unreachable from this shell.
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { PrismaPg } = require('@prisma/adapter-pg');
const { PrismaClient } = require('./dist/generated/prisma/client');

const ORG = 'org-test';
const TICKET = 'ticket-test';
const USER = 'user-test';

const queries = [
  ['ticket.create', (p) => p.ticket.create({
    data: {
      organizationId: ORG,
      ticketNumber: 'SF-1',
      subject: 'Test',
      description: 'Desc',
      status: 'OPEN',
      priority: 'MEDIUM',
      source: 'PORTAL',
      categoryId: null,
      departmentId: null,
      createdById: USER,
      dueAt: null,
      firstResponseDueAt: new Date(),
      resolutionDueAt: new Date(),
    },
  })],
  ['ticketActivity.create', (p) => p.ticketActivity.create({
    data: {
      organizationId: ORG,
      ticketId: TICKET,
      actorId: USER,
      activityType: 'CREATED',
      title: 'Ticket created',
      message: null,
      metadata: { subject: 'x' },
    },
  })],
  ['notification.create', (p) => p.notification.create({
    data: {
      userId: USER,
      organizationId: ORG,
      type: 'TICKET_UPDATED',
      channel: 'IN_APP',
      title: 't',
      body: 'b',
      data: { ticketId: TICKET },
      relatedEntityType: 'Ticket',
      relatedEntityId: TICKET,
      deliveryStatus: 'DELIVERED',
      deliveredAt: new Date(),
      sentAt: new Date(),
    },
  })],
  ['notification.createMany', (p) => p.notification.createMany({
    data: [{
      userId: USER,
      organizationId: ORG,
      type: 'TICKET_UPDATED',
      channel: 'IN_APP',
      title: 't',
      body: 'b',
      data: { ticketId: TICKET },
      relatedEntityType: 'Ticket',
      relatedEntityId: TICKET,
      deliveryStatus: 'DELIVERED',
      deliveredAt: new Date(),
      sentAt: new Date(),
    }],
  })],
  ['auditLog.create', (p) => p.auditLog.create({
    data: {
      organizationId: ORG,
      actorId: USER,
      actorEmail: 'a@b.c',
      actorName: 'A B',
      action: 'CREATE',
      entityType: 'Ticket',
      entityId: TICKET,
      ipAddress: '127.0.0.1',
      userAgent: 'test',
      metadata: { ticketNumber: 'SF-1' },
    },
  })],
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
