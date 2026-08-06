import { UnauthorizedException } from '@nestjs/common';

// The generated Prisma client is ESM and cannot be compiled by ts-jest (CJS).
jest.mock('../../generated/prisma/client', () => ({ PrismaClient: class {} }));
jest.mock('@prisma/adapter-pg', () => ({ PrismaPg: class {} }));

import { PasswordService } from './password.service';

describe('PasswordService', () => {
  let service: PasswordService;
  let prisma: {
    passwordResetToken: { create: jest.Mock; findUnique: jest.Mock };
  };

  beforeEach(() => {
    prisma = {
      passwordResetToken: {
        create: jest.fn().mockResolvedValue({ id: 'prt-1' }),
        findUnique: jest.fn(),
      },
    };
    service = new PasswordService(prisma as never);
  });

  describe('createResetToken', () => {
    it('creates a token valid for one hour', async () => {
      const token = await service.createResetToken('user-1');
      const data = prisma.passwordResetToken.create.mock.calls[0][0].data;

      expect(typeof token).toBe('string');
      expect(data.userId).toBe('user-1');
      expect(data.expiresAt.getTime()).toBeGreaterThan(Date.now());
      expect(data.expiresAt.getTime()).toBeLessThanOrEqual(
        Date.now() + 2 * 60 * 60 * 1000,
      );
    });
  });

  describe('validateResetToken', () => {
    const liveToken = {
      id: 'prt-1',
      token: 'tok',
      userId: 'user-1',
      usedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    };

    it('returns the token when valid', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue(liveToken);
      await expect(service.validateResetToken('tok')).resolves.toEqual(
        liveToken,
      );
    });

    it('rejects missing tokens', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue(null);
      await expect(service.validateResetToken('tok')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('rejects already-used tokens', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue({
        ...liveToken,
        usedAt: new Date(),
      });
      await expect(service.validateResetToken('tok')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('rejects expired tokens', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue({
        ...liveToken,
        expiresAt: new Date(Date.now() - 60_000),
      });
      await expect(service.validateResetToken('tok')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });
});
