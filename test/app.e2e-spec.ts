import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';

// The generated Prisma client is ESM and cannot be compiled by ts-jest (CJS).
jest.mock('../generated/prisma/client', () => ({ PrismaClient: class {} }));
jest.mock('@prisma/adapter-pg', () => ({ PrismaPg: class {} }));

import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';
import { SupabaseStorageService } from './../src/storage/supabase.storage.service';
import { BrevoEmailService } from './../src/email/brevo.service';

// Required by the Joi validation schema before the app can boot.
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
process.env.JWT_SECRET = 'a'.repeat(64);
process.env.JWT_REFRESH_SECRET = 'b'.repeat(64);
process.env.BREVO_API_KEY = 'brevo-test-key';
process.env.EMAIL_FROM = 'noreply@supportflow.test';
process.env.FRONTEND_URL = 'http://localhost:3000';
process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_PUBLISHABLE_KEY = 'pk-test';
process.env.SUPABASE_SECRET_KEY = 'sk-test';
process.env.SUPABASE_BUCKET = 'supportflow';
process.env.PAYCHANGU_ENV = 'sandbox';

/**
 * Proxy-based Prisma mock: every model delegate resolves to empty results, so
 * no database is touched and scheduled jobs / middleware degrade gracefully.
 */
function createPrismaMock(): unknown {
  const modelMethods = {
    findMany: jest.fn().mockResolvedValue([]),
    findUnique: jest.fn().mockResolvedValue(null),
    findFirst: jest.fn().mockResolvedValue(null),
    count: jest.fn().mockResolvedValue(0),
    create: jest.fn().mockResolvedValue({ id: 'mock-id' }),
    createMany: jest.fn().mockResolvedValue({ count: 1 }),
    update: jest.fn().mockResolvedValue({ id: 'mock-id' }),
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    upsert: jest.fn().mockResolvedValue({ id: 'mock-id' }),
    delete: jest.fn().mockResolvedValue({ id: 'mock-id' }),
    deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    groupBy: jest.fn().mockResolvedValue([]),
    aggregate: jest.fn().mockResolvedValue({ _count: 0 }),
    countBy: jest.fn().mockResolvedValue([]),
  };

  const model = new Proxy(modelMethods as Record<string, jest.Mock>, {
    get(target, prop) {
      if (typeof prop !== 'string') return undefined;
      return target[prop] ?? target.findMany;
    },
  });

  return new Proxy(model, {
    get(target, prop) {
      if (typeof prop !== 'string') return undefined;
      switch (prop) {
        case '$queryRaw':
          return jest.fn().mockResolvedValue([{ '?column?': 1 }]);
        case '$connect':
        case '$disconnect':
          return jest.fn().mockResolvedValue(undefined);
        case '$transaction':
          return (fn: (tx: unknown) => Promise<unknown>) => fn(target);
        case 'then':
          return undefined;
        default:
          return (target as Record<string, jest.Mock>)[prop] ?? model;
      }
    },
  });
}

describe('App (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(createPrismaMock())
      .overrideProvider(SupabaseStorageService)
      .useValue({})
      .overrideProvider(BrevoEmailService)
      .useValue({})
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('protects the root route with global JWT auth', async () => {
    const res = await request(app.getHttpServer()).get('/').expect(401);
    expect(res.body.statusCode).toBe(401);
  });

  it('exposes a public liveness probe', async () => {
    const res = await request(app.getHttpServer())
      .get('/health/live')
      .expect(200);
    expect(res.body.status).toBe('ok');
  });

  it('reports readiness against the (mocked) database', async () => {
    const res = await request(app.getHttpServer())
      .get('/health/ready')
      .expect(200);
    expect(res.body.status).toBe('ready');
  });
});
