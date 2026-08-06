import { UnauthorizedException } from '@nestjs/common';
import { createHash } from 'node:crypto';

// The generated Prisma client is ESM and cannot be compiled by ts-jest (CJS);
// the tests below exercise the service against a mocked delegate instead.
jest.mock('../../generated/prisma/client', () => ({ PrismaClient: class {} }));
jest.mock('@prisma/adapter-pg', () => ({ PrismaPg: class {} }));

import { RefreshTokenService } from './refresh-token.service';

describe('RefreshTokenService', () => {
  let service: RefreshTokenService;
  let prisma: {
    refreshToken: {
      create: jest.Mock;
      findUnique: jest.Mock;
      updateMany: jest.Mock;
    };
  };

  const hashOf = (token: string) =>
    createHash('sha256').update(token).digest('hex');

  beforeEach(() => {
    prisma = {
      refreshToken: {
        create: jest.fn().mockResolvedValue({ id: 'rt-1' }),
        findUnique: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    service = new RefreshTokenService(prisma as never);
  });

  describe('createRefreshToken', () => {
    it('stores the SHA-256 digest, never the raw token', async () => {
      const token = await service.createRefreshToken('user-1');
      const stored = prisma.refreshToken.create.mock.calls[0][0];

      expect(typeof token).toBe('string');
      expect(token).not.toBe(stored.data.token);
      expect(stored.data.token).toBe(hashOf(token));
      expect(stored.data.userId).toBe('user-1');
      expect(stored.data.expiresAt.getTime()).toBeGreaterThan(Date.now());
    });
  });

  describe('verifyRefreshToken', () => {
    it('looks up by the hashed token', async () => {
      const token = 'some-raw-token';
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: 'rt-1',
        userId: 'user-1',
        revokedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
      });

      const result = await service.verifyRefreshToken(token);

      expect(prisma.refreshToken.findUnique).toHaveBeenCalledWith({
        where: { token: hashOf(token) },
      });
      expect(result).toEqual({ userId: 'user-1', tokenId: 'rt-1' });
    });

    it('rejects an unknown token', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(null);
      await expect(service.verifyRefreshToken('nope')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('rejects revoked tokens', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: 'rt-1',
        userId: 'user-1',
        revokedAt: new Date(),
        expiresAt: new Date(Date.now() + 60_000),
      });
      await expect(service.verifyRefreshToken('token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('rejects expired tokens', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: 'rt-1',
        userId: 'user-1',
        revokedAt: null,
        expiresAt: new Date(Date.now() - 60_000),
      });
      await expect(service.verifyRefreshToken('token')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('rotateRefreshToken', () => {
    it('revokes the previous token before issuing a new one', async () => {
      await service.rotateRefreshToken('user-1', 'old-token');

      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { token: hashOf('old-token'), revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
      expect(prisma.refreshToken.create).toHaveBeenCalled();
    });
  });

  describe('revokeRefreshToken', () => {
    it('revokes by hashed token only when still live', async () => {
      await service.revokeRefreshToken('token');

      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { token: hashOf('token'), revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
    });
  });
});
