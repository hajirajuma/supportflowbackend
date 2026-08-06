import { ConfigService } from '@nestjs/config';

// The generated Prisma client is ESM and cannot be compiled by ts-jest (CJS).
jest.mock('../../generated/prisma/client', () => ({ PrismaClient: class {} }));
jest.mock('@prisma/adapter-pg', () => ({ PrismaPg: class {} }));

import { HealthService } from './health.service';
import { PrismaService } from '../prisma/prisma.service';
import { SupabaseStorageService } from '../storage/supabase.storage.service';
import { BrevoEmailService } from '../email/brevo.service';

describe('HealthService', () => {
  let service: HealthService;
  let prisma: { $queryRaw: jest.Mock };
  let storage: { ping: jest.Mock };
  let email: { ping: jest.Mock };
  let config: { get: jest.Mock };

  beforeEach(() => {
    prisma = { $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]) };
    storage = { ping: jest.fn().mockResolvedValue(undefined) };
    email = { ping: jest.fn().mockResolvedValue(undefined) };
    config = {
      get: jest.fn().mockImplementation((key: string) => {
        const values: Record<string, unknown> = {
          NODE_ENV: 'test',
          'supabase.url': undefined,
          'brevo.apiKey': undefined,
          'paychangu.secretKey': undefined,
          'paychangu.isSandbox': true,
        };
        return values[key];
      }),
    };
    service = new HealthService(
      prisma as unknown as PrismaService,
      storage as unknown as SupabaseStorageService,
      email as unknown as BrevoEmailService,
      config as unknown as ConfigService,
    );
  });

  it('reports service info with uptime', () => {
    const info = service.getServiceInfo();
    expect(info.name).toBe('supportflow-backend');
    expect(info.environment).toBe('test');
    expect(typeof info.uptimeSeconds).toBe('number');
  });

  it('reports the database as up when the probe succeeds', async () => {
    const result = await service.checkDatabase();
    expect(result.status).toBe('up');
    expect(typeof result.latencyMs).toBe('number');
  });

  it('reports the database as down when the probe fails', async () => {
    prisma.$queryRaw.mockRejectedValue(new Error('connection refused'));
    const result = await service.checkDatabase();
    expect(result.status).toBe('down');
  });

  it('skips storage/email/payments when unconfigured', async () => {
    const [storageResult, emailResult, paymentsResult] = await Promise.all([
      service.checkStorage(),
      service.checkEmail(),
      service.checkPayments(),
    ]);
    expect(storageResult.status).toBe('up');
    expect(storageResult.detail).toBe('not-configured');
    expect(emailResult.status).toBe('up');
    expect(paymentsResult.status).toBe('up');
    expect(paymentsResult.detail).toBe('not-configured');
  });

  it('reports storage as down when the ping fails', async () => {
    config.get.mockImplementation((key: string) =>
      key === 'supabase.url' ? 'https://x.supabase.co' : undefined,
    );
    storage.ping.mockRejectedValue(new Error('401'));
    const result = await service.checkStorage();
    expect(result.status).toBe('down');
  });

  it('reports email as down when the ping fails', async () => {
    config.get.mockImplementation((key: string) =>
      key === 'brevo.apiKey' ? 'key' : undefined,
    );
    email.ping.mockRejectedValue(new Error('unauthorized'));
    const result = await service.checkEmail();
    expect(result.status).toBe('down');
  });

  it('reports payment environment when configured', async () => {
    config.get.mockImplementation((key: string) =>
      key === 'paychangu.secretKey'
        ? 'sk-test'
        : key === 'paychangu.isSandbox'
          ? false
          : undefined,
    );
    const result = await service.checkPayments();
    expect(result.status).toBe('up');
    expect(result.detail).toBe('live');
  });

  it('checkAll aggregates every dependency', async () => {
    const all = await service.checkAll();
    expect(Object.keys(all).sort()).toEqual([
      'database',
      'email',
      'payments',
      'storage',
    ]);
    expect(all.database.status).toBe('up');
  });
});
