import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { TokenService } from './token.service';

describe('TokenService', () => {
  let service: TokenService;
  let jwtService: { sign: jest.Mock; verify: jest.Mock };
  let configService: { get: jest.Mock };

  const payload = {
    userId: 'user-1',
    organizationId: 'org-1',
    role: 'TENANT_OWNER',
    email: 'owner@example.com',
  };

  beforeEach(() => {
    jwtService = {
      sign: jest.fn().mockReturnValue('signed-token'),
      verify: jest.fn().mockReturnValue(payload),
    };
    configService = {
      get: jest.fn().mockReturnValue(undefined),
    };
    service = new TokenService(
      jwtService as unknown as JwtService,
      configService as unknown as ConfigService,
    );
  });

  describe('signAccessToken', () => {
    it('signs with a default TTL when unconfigured', async () => {
      await service.signAccessToken(payload);
      expect(jwtService.sign).toHaveBeenCalledWith(payload, {
        expiresIn: '15m',
      });
    });

    it('uses the configured TTL', async () => {
      configService.get.mockReturnValue('30m');
      await service.signAccessToken(payload);
      expect(jwtService.sign).toHaveBeenCalledWith(payload, {
        expiresIn: '30m',
      });
    });
  });

  describe('signRefreshToken', () => {
    it('returns an opaque random token', async () => {
      const token = await service.signRefreshToken();
      expect(typeof token).toBe('string');
      expect(token.length).toBeGreaterThan(20);
    });
  });

  describe('verifyAccessToken', () => {
    it('delegates to the JwtService', async () => {
      const result = await service.verifyAccessToken('signed-token');
      expect(jwtService.verify).toHaveBeenCalledWith('signed-token');
      expect(result.userId).toBe('user-1');
    });
  });
});
