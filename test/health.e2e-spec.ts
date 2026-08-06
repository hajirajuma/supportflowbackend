import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import request from 'supertest';
import { App } from 'supertest/types';

// The generated Prisma client is ESM and cannot be compiled by ts-jest (CJS).
jest.mock('../generated/prisma/client', () => ({ PrismaClient: class {} }));
jest.mock('@prisma/adapter-pg', () => ({ PrismaPg: class {} }));

import { HealthController } from '../src/health/health.controller';
import { HealthService } from '../src/health/health.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { SupabaseStorageService } from '../src/storage/supabase.storage.service';
import { BrevoEmailService } from '../src/email/brevo.service';

describe('Health (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: { $queryRaw: jest.Mock };
  let config: { get: jest.Mock };

  beforeEach(async () => {
    prisma = { $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]) };
    config = {
      get: jest.fn().mockImplementation((key: string) => {
        const values: Record<string, unknown> = {
          NODE_ENV: 'test',
          'supabase.url': undefined,
          'brevo.apiKey': undefined,
          'paychangu.secretKey': undefined,
        };
        return values[key];
      }),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        HealthService,
        { provide: PrismaService, useValue: prisma },
        { provide: SupabaseStorageService, useValue: { ping: jest.fn() } },
        { provide: BrevoEmailService, useValue: { ping: jest.fn() } },
        { provide: ConfigService, useValue: config },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('GET /health returns liveness', async () => {
    const res = await request(app.getHttpServer()).get('/health').expect(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.name).toBe('supportflow-backend');
  });

  it('GET /health/live returns liveness', async () => {
    const res = await request(app.getHttpServer())
      .get('/health/live')
      .expect(200);
    expect(res.body.status).toBe('ok');
  });

  it('GET /health/ready returns 200 when the database is reachable', async () => {
    const res = await request(app.getHttpServer())
      .get('/health/ready')
      .expect(200);
    expect(res.body.status).toBe('ready');
    expect(res.body.checks.database.status).toBe('up');
  });

  it('GET /health/ready returns 503 when the database is down', async () => {
    prisma.$queryRaw.mockRejectedValue(new Error('connection refused'));
    const res = await request(app.getHttpServer())
      .get('/health/ready')
      .expect(503);
    expect(res.body.status).toBe('error');
  });

  it('GET /health/deps returns the full dependency matrix', async () => {
    const res = await request(app.getHttpServer())
      .get('/health/deps')
      .expect(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.checks).toHaveProperty('database');
    expect(res.body.checks).toHaveProperty('storage');
    expect(res.body.checks).toHaveProperty('email');
    expect(res.body.checks).toHaveProperty('payments');
  });
});
