import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: { getAllAndOverride: jest.Mock };

  const context = (user: unknown) => ({
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
  });

  beforeEach(() => {
    reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(undefined),
    };
    guard = new RolesGuard(reflector as unknown as Reflector);
  });

  it('allows routes without role metadata', () => {
    expect(guard.canActivate(context({}) as never)).toBe(true);
  });

  it('allows users with a matching role', () => {
    reflector.getAllAndOverride.mockReturnValue([
      'TENANT_OWNER',
      'SUPPORT_AGENT',
    ]);
    expect(guard.canActivate(context({ role: 'SUPPORT_AGENT' }) as never)).toBe(
      true,
    );
  });

  it('rejects users without a matching role', () => {
    reflector.getAllAndOverride.mockReturnValue(['TENANT_OWNER']);
    expect(() =>
      guard.canActivate(context({ role: 'CUSTOMER' }) as never),
    ).toThrow(ForbiddenException);
  });

  it('requires an authenticated user when roles are declared', () => {
    reflector.getAllAndOverride.mockReturnValue(['TENANT_OWNER']);
    expect(() => guard.canActivate(context(null) as never)).toThrow(
      UnauthorizedException,
    );
  });
});
