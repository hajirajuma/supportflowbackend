import { RequestContextService } from './request-context.service';

describe('RequestContextService', () => {
  let service: RequestContextService;

  beforeEach(() => {
    service = new RequestContextService();
  });

  it('returns undefined outside a context', () => {
    expect(service.getCurrent()).toBeUndefined();
    expect(service.getCurrentOrganizationId()).toBeUndefined();
    expect(service.getCurrentUserId()).toBeUndefined();
  });

  it('exposes the snapshot inside run()', () => {
    const snapshot = {
      requestId: 'req-1',
      userId: 'u-1',
      organizationId: 'org-1',
      role: 'SUPPORT_AGENT',
      subdomain: 'acme',
    };

    const seen = service.run(snapshot, () => ({
      current: service.getCurrent(),
      orgId: service.getCurrentOrganizationId(),
      userId: service.getCurrentUserId(),
      role: service.getCurrentRole(),
      subdomain: service.getCurrentSubdomain(),
      tenant: service.getCurrentTenant(),
    }));

    expect(seen.current?.requestId).toBe('req-1');
    expect(seen.orgId).toBe('org-1');
    expect(seen.userId).toBe('u-1');
    expect(seen.role).toBe('SUPPORT_AGENT');
    expect(seen.subdomain).toBe('acme');
    expect(seen.tenant).toBeUndefined();
  });

  it('isolates concurrent runs (no cross-request leakage)', async () => {
    const results = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        service.run({ requestId: `req-${i}`, organizationId: `org-${i}` }, () =>
          service.getCurrentOrganizationId(),
        ),
      ),
    );

    results.forEach((orgId, i) => {
      expect(orgId).toBe(`org-${i}`);
    });
  });

  it('is empty again after run() completes', () => {
    service.run({ requestId: 'req-1' }, () => {
      /* noop */
    });
    expect(service.getCurrent()).toBeUndefined();
  });
});
