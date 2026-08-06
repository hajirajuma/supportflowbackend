# SupportFlow Backend

Multi-tenant client feedback & support portal backend, built for production.

| | |
|---|---|
| **Framework** | NestJS 11 |
| **ORM** | Prisma 7 (driver adapters, PostgreSQL / Neon) |
| **Auth** | JWT access + hashed refresh tokens, RBAC |
| **Multi-tenancy** | Subdomain + custom-domain resolution, request-context scoped |
| **Storage** | Supabase (private + public buckets) |
| **Email** | Brevo |
| **Payments** | PayChangu (webhook-verified) |
| **Docs** | Swagger at `/docs` (non-production) |

---

## Features

- **Authentication** — register, login, email verification, password reset, refresh-token rotation
- **Multi-tenant RBAC** — `PLATFORM_ADMIN`, `TENANT_OWNER`, `SUPPORT_AGENT`, `CUSTOMER`
- **Organizations** — settings, branding, members, invitations (with expiry + resend)
- **Customer portal** — knowledge base (articles, categories, versions, comments, votes), feedback forms, public ticket intake
- **Tickets** — lifecycle, assignment, replies, tags, watchers, attachments, SLAs, activity log, search
- **Feedback** — forms, questions, responses, ratings, requests, lifecycle jobs
- **Notifications** — in-app (WebSocket), email, scheduled announcements, templates, preferences
- **Subscriptions & billing** — plans, trials, checkout, webhooks, invoices, payment history, feature gating
- **Dashboard & analytics** — KPIs, charts, reports, revenue, exports
- **Platform administration** — tenants, users, settings, subdomains, ownership transfer
- **Operations** — health checks, structured logging, audit log, global rate limiting, graceful shutdown

---

## Quick start

### 1. Prerequisites

- Node.js 20+
- PostgreSQL (local or Neon)
- Supabase project (storage buckets)
- Brevo API key
- PayChangu sandbox keys

### 2. Environment

```bash
cp .env.example .env
# fill in DATABASE_URL, JWT_SECRET, JWT_REFRESH_SECRET, SUPABASE_*, BREVO_API_KEY, PAYCHANGU_*
```

### 3. Database

```bash
npx prisma migrate deploy   # apply migrations
npm run prisma:seed         # platform admin, plans, permissions, roles, categories
```

### 4. Run

```bash
npm install
npm run start:dev           # http://localhost:3001, docs at /docs
```

### 5. Tests & checks

```bash
npm run lint
npm run build
npm test                    # unit tests
npm run test:e2e            # end-to-end (no DB required — mocked)
```

---

## Project layout

```
src/
├── auth/                 # JWT, refresh tokens, password, email verification
├── audit-log/            # immutable audit trail
├── common/               # guards, middleware, filters, interceptors, utils, decorators
├── config/               # env validation (Joi) + typed configuration
├── customer/             # customer portal (profile, knowledge base)
├── dashboard/            # analytics, KPIs, charts, reports, exports
├── email/                # Brevo provider
├── feedback/             # feedback forms, questions, responses, requests
├── health/               # liveness / readiness probes
├── knowledge/            # knowledge-base management API
├── logger/               # pino-based structured logging
├── notifications/        # in-app + email + announcements + templates
├── organizations/        # org settings, branding, members, invitations
├── platform-admin/       # platform-level administration
├── prisma/               # PrismaService (driver adapter)
├── request-context/      # AsyncLocalStorage request context
├── storage/              # Supabase storage provider
├── subscriptions/        # plans, trials, payments, webhooks, invoices
├── tickets/              # ticket lifecycle, replies, tags, SLA
└── main.ts               # bootstrap (helmet, CORS, validation, swagger)
```

---

## Security model

- **Tenant isolation** — `organizationId` never comes from the client; it is resolved from the authenticated user, the subdomain/custom-domain resolution, or the platform-admin scope. Every service query is scoped.
- **RBAC** — global `JwtAuthGuard` + `RolesGuard`; module guards derive access from the JWT role.
- **Rate limiting** — global throttler + tighter limits on auth endpoints.
- **Headers** — Helmet, CORS allow-list, `x-request-id` propagation.
- **Secrets** — validated at boot with Joi; missing secrets abort startup.
- **Webhooks** — PayChangu webhooks verified and idempotent (provider transaction id lookup).
- **Refresh tokens** — stored as SHA-256 hashes with an indexed lookup; rotated on use.

---

## Operations

| Endpoint | Purpose |
|---|---|
| `GET /health/live` | Liveness — process is up |
| `GET /health/ready` | Readiness — DB, storage, email, payment provider reachable |

Structured JSON logs via pino (`LOG_LEVEL` to control verbosity).

---

## Deployment

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for Render, Railway, and Docker instructions,
[docs/ENVIRONMENT.md](docs/ENVIRONMENT.md) for the full environment reference, and
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the design overview.
The production-readiness audit is recorded in [docs/AUDIT.md](docs/AUDIT.md).

## License

UNLICENSED — private project.
