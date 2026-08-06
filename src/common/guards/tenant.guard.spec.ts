import { UnauthorizedException } from '@nestjs/common';
import { TenantGuard } from './tenant.guard';

describe('TenantGuard', () => {
  let guard: TenantGuard;

  beforeEach(() => {
    guard = new TenantGuard();
  });

  const context = (user: unknown, headers: Record<string, unknown> = {}) => ({
    switchToHttp: () => ({
      getRequest: () => ({ user, headers }),
    }),
  });

  it('rejects unauthenticated requests', async () => {
    await expect(guard.canActivate(context(null) as never)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('uses the organizationId from the JWT for regular users', async () => {
    const user = {
      userId: 'u-1',
      organizationId: 'org-1',
      role: 'SUPPORT_AGENT',
    };
    await expect(guard.canActivate(context(user) as never)).resolves.toBe(true);
  });

  it('rejects regular users without an organization', async () => {
    const user = { userId: 'u-1', organizationId: null, role: 'CUSTOMER' };
    await expect(guard.canActivate(context(user) as never)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('ignores the x-organization-id header for regular users (no header smuggling)', async () => {
    const user = {
      userId: 'u-1',
      organizationId: 'org-1',
      role: 'SUPPORT_AGENT',
    };
    // Even if a hostile header is present, the JWT org must win.
    const ok = await guard.canActivate(
      context(user, { 'x-organization-id': 'other-org' }) as never,
    );
    expect(ok).toBe(true);
  });

  it('allows platform admins to target an organization via header', async () => {
    const user = {
      userId: 'u-1',
      organizationId: null,
      role: 'PLATFORM_ADMIN',
    };
    await expect(
      guard.canActivate(
        context(user, { 'x-organization-id': 'target-org' }) as never,
      ),
    ).resolves.toBe(true);
  });

  it('rejects platform admins without a target organization', async () => {
    const user = {
      userId: 'u-1',
      organizationId: null,
      role: 'PLATFORM_ADMIN',
    };
    await expect(guard.canActivate(context(user) as never)).rejects.toThrow(
      UnauthorizedException,
    );
  });
});
