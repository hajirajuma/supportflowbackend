import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { RequestContextService } from '../../request-context/request-context.service';

const TENANT_CACHE_TTL_MS = 60_000;

interface CacheEntry {
  organizationId: string | null;
  expiresAt: number;
}

/**
 * Resolves the tenant for the current request from the Host header
 * (subdomain or custom domain) and exposes it through the request context.
 *
 * Resolutions are cached for 60s so public portal routes don't hit the
 * database on every page view. A DB failure degrades to an unscoped context;
 * authorization-critical routes never rely on this middleware alone.
 */
@Injectable()
export class TenantMiddleware implements NestMiddleware {
  private readonly cache = new Map<string, CacheEntry>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly requestContextService: RequestContextService,
  ) {}

  async use(req: Request, res: Response, next: NextFunction) {
    const host = (req.headers.host ?? '').toLowerCase();
    const normalizedHost = host.split(':')[0];
    const isLocalhost = normalizedHost === 'localhost';
    const subdomain = isLocalhost ? undefined : normalizedHost.split('.')[0];
    const customDomain = isLocalhost ? undefined : normalizedHost;

    let organizationId: string | null = null;

    const cacheKey = subdomain
      ? `sub:${subdomain}`
      : customDomain
        ? `dom:${customDomain}`
        : null;

    if (cacheKey) {
      const cached = this.cache.get(cacheKey);
      if (cached && cached.expiresAt > Date.now()) {
        organizationId = cached.organizationId;
      } else {
        try {
          const organization = await this.prisma.organization.findFirst({
            where: {
              OR: [
                ...(subdomain ? [{ slug: subdomain }] : []),
                ...(customDomain
                  ? [{ customDomain }, { website: customDomain }]
                  : []),
              ],
            },
            select: { id: true },
          });
          organizationId = organization?.id ?? null;
        } catch {
          // DB failures must not take down every request; the guard layer and
          // service scoping still enforce authorization.
        }
        this.cache.set(cacheKey, {
          organizationId,
          expiresAt: Date.now() + TENANT_CACHE_TTL_MS,
        });
      }
    }

    const snapshot = this.requestContextService.getCurrent();
    const currentContext = snapshot ?? {
      requestId:
        (req.headers['x-request-id'] as string | undefined) ?? `${Date.now()}`,
      request: req,
      response: res,
    };

    this.requestContextService.run(
      {
        ...currentContext,
        organizationId: organizationId ?? undefined,
        subdomain,
        tenant: organizationId
          ? { id: organizationId, subdomain, customDomain }
          : undefined,
        request: req,
        response: res,
      },
      () => next(),
    );
  }
}
