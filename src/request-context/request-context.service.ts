import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';
import type { Request, Response } from 'express';

export type RequestContextSnapshot = {
  requestId: string;
  userId?: string;
  organizationId?: string;
  role?: string;
  subdomain?: string;
  tenant?: { id?: string; subdomain?: string; customDomain?: string };
  request?: Request;
  response?: Response;
};

/**
 * Request-scoped state backed by AsyncLocalStorage.
 *
 * This service intentionally has NO constructor dependencies so it stays a
 * static singleton. If it injected `REQUEST`, it would become request-scoped,
 * which would make every global guard that depends on it (e.g. JwtAuthGuard)
 * request-scoped too — and Nest instantiates request-scoped global enhancers
 * from `Object.create` prototypes, so their constructor/DI never runs.
 */
@Injectable()
export class RequestContextService {
  private readonly storage = new AsyncLocalStorage<RequestContextSnapshot>();

  run<T>(context: RequestContextSnapshot, callback: () => T): T {
    return this.storage.run(context, callback);
  }

  getCurrent(): RequestContextSnapshot | undefined {
    return this.storage.getStore();
  }

  getCurrentOrganizationId(): string | undefined {
    return this.getCurrent()?.organizationId;
  }

  getCurrentUserId(): string | undefined {
    return this.getCurrent()?.userId;
  }

  getCurrentRole(): string | undefined {
    return this.getCurrent()?.role;
  }

  getCurrentSubdomain(): string | undefined {
    return this.getCurrent()?.subdomain;
  }

  getCurrentTenant(): RequestContextSnapshot['tenant'] | undefined {
    return this.getCurrent()?.tenant;
  }

  getRequest(): Request | undefined {
    return this.getCurrent()?.request;
  }
}
