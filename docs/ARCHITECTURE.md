# Architecture Overview

## High-level flow

```
                 ┌──────────────────────────────────────────────┐
                 │                 HTTP request                 │
                 └──────────────────────┬───────────────────────┘
                                        ▼
   ┌───────────────┐   ┌───────────────────────────┐
   │ main.ts       │   │ pino request logger       │
   │ helmet/CORS   │   │ request-context middleware │  ← requestId + ALS scope
   └───────┬───────┘   └─────────────┬─────────────┘
           ▼                         ▼
   ┌──────────────────────────────────────────────┐
   │ TenantMiddleware (module middleware, all *)  │  ← subdomain/custom-domain → org (60s cache)
   ├──────────────────────────────────────────────┤
   │ ThrottlerGuard (global)                      │  ← rate limiting
   │ JwtAuthGuard (global)                        │  ← Bearer JWT → passport strategy → user
   │ RolesGuard (global)                          │  ← @Roles metadata enforcement
   │ Module guards (tickets/feedback/… )          │  ← build access object + tenant scoping
   └──────────────────────┬───────────────────────┘
                          ▼
   ┌──────────────────────────────────────────────┐
   │ Controller → Service → Prisma (scoped)       │
   │   → Supabase / Brevo / PayChangu             │
   └──────────────────────┬───────────────────────┘
                          ▼
   Global HttpExceptionFilter → consistent error envelope
```

## Request context

`RequestContextService` is a **static singleton** backed by `AsyncLocalStorage`. The bootstrap
middleware and `TenantMiddleware` open a per-request scope containing `requestId`, `user`,
`organizationId`, `role`, `subdomain`, and tenant info. Guards and services read it via
`getCurrentOrganizationId()` etc.

> **Why it must stay a singleton:** a request-scoped `RequestContextService` would make every
> global guard depending on it request-scoped; Nest then instantiates request-scoped global
> enhancers from `Object.create` prototypes and their constructor/DI never runs (this exact bug
> broke all requests with 500s and is covered by `jwt-auth.guard.di.spec.ts`).

## Multi-tenancy & RBAC

- **Roles** (schema enums): `PLATFORM_ADMIN`, `TENANT_OWNER`, `SUPPORT_AGENT`, `CUSTOMER`.
- **Tenant resolution:** authenticated users carry `organizationId` in the JWT; public portal
  routes resolve the org from the Host header (subdomain slug or custom domain) with a 60s
  cache; platform admin operates on an explicit org scope.
- **Isolation rules enforced in code:**
  - `organizationId` is never accepted from request bodies/query/headers.
  - Module access guards (`TicketAccessGuard`, `FeedbackAccessGuard`, …) derive access purely
    from `req.user` and reject cross-org access at the query layer.
  - `TenantGuard` prevents customer/agent routes from being reached without an org scope.

## Modules

| Module | Responsibility |
|---|---|
| `auth` | Registration, login, refresh rotation, password, email verification, JWT strategy |
| `organizations` | Org settings, branding, members, roles, invitations (expiry jobs) |
| `customer` | Customer portal: profile, public knowledge base, self-service |
| `tickets` | Ticket lifecycle, replies, tags, watchers, attachments, SLA, activity, search |
| `feedback` | Feedback forms/questions/responses, requests lifecycle job |
| `notifications` | In-app (Socket.io gateway), email, announcements, templates, preferences, scheduling |
| `subscriptions` | Plans, trials, checkout, PayChangu webhooks, invoices, feature gates, usage |
| `dashboard` | KPIs, charts, reports, revenue, exports (org-scoped) |
| `knowledge` | KB management API (categories, articles, versions, comments, votes) |
| `platform-admin` | Cross-tenant administration, ownership transfer, settings |
| `audit-log` | Immutable audit trail |
| `health` | Liveness/readiness probes |
| `logger` | pino structured logging |
| `storage` / `email` | Supabase / Brevo provider adapters |
| `request-context` | ALS request scope |

## Data layer

- Prisma 7 with the `@prisma/adapter-pg` driver adapter (required by the generated client).
- `prisma/schema.prisma` is the single source of truth; `prisma/migrations` contains the
  regenerated initial migration. **Do not use `(this.prisma as any)` casts** — add the model
  to the schema instead.
- All tenant-scoped queries filter on `organizationId`; platform-admin paths explicitly opt in.

## Background jobs (`@nestjs/schedule`)

- Trial lifecycle (start/expire), subscription expiration, announcement publishing, scheduled
  notification delivery, notification expiry, feedback-request lifecycle — all via `@Cron`.

## Observability

- pino JSON logs; `LOG_LEVEL` controls verbosity; request IDs propagate via `x-request-id`.
- `/health/live` (process up) and `/health/ready` (DB, storage, email, payments reachable).
- Global `HttpExceptionFilter` maps Prisma errors (`P2002` → 409, `P2025` → 404, …) to a
  consistent envelope: `{ success, statusCode, message, error, details, timestamp, path, requestId }`.

## Testing strategy

- **Unit:** services, guards, utils, policies — dependencies mocked; Prisma client module mocked
  where `PrismaService` is touched (the generated client is ESM and ts-jest runs CJS).
- **E2E:** `test/app.e2e-spec.ts` boots the full `AppModule` against a proxied Prisma mock and
  verifies global auth + health; `test/health.e2e-spec.ts` covers the probes.
