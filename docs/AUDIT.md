# Production-Readiness Audit

Record of the full audit performed on SupportFlow, the issues found, and the fixes applied.

## Critical: schema drift

The application code and the Prisma schema had drifted so far that the app could not run:

- Services queried models that did not exist in `schema.prisma` — `Payment`, `Invoice`,
  `NotificationTemplate`, `Announcement`, `NotificationPreference`, `Tag`, `TicketCategory`,
  `FeedbackRequest`, and more — via `(this.prisma as any)....` casts.
- The schema referenced enums and fields (`OWNER`/`ADMIN`/`AGENT` roles, `planType`,
  `apiRateLimitPerMinute`, etc.) that the code never used, while omitting fields the code
  required (`code`, `trialDays`, `sortOrder`, `billingInterval`, `dueAt`, `lastActivityAt`,
  `categoryId`, `avatarUrl`, ...).
- The initial migration predated both.

**Fix:** rewrote `prisma/schema.prisma` to the data shapes the application actually uses
(55 models), regenerated the initial migration from scratch, and regenerated the Prisma client.

## Critical: build did not compile

`npm run build` failed with 46 TypeScript errors (mostly pre-existing in the dashboard module:
string-enum nominal typing, missing DTO fields, wrong decorator import).

**Fix:** all 46 errors resolved; the project now builds cleanly.

## Critical: application did not boot

- `JwtAuthGuard` extended the passport mixin and injected `RequestContextService`, which was
  request-scoped (it injected `REQUEST`). Request-scoped global guards are instantiated by Nest
  from `Object.create` prototypes — the constructor and DI never run, so `reflector` was
  `undefined` and **every request returned 500**.
  **Fix:** `RequestContextService` is now a static singleton (AsyncLocalStorage-based, no
  `REQUEST` dependency). The passport-mixin regression is covered by a dedicated spec.
- `AuthModule` (and therefore the `JwtStrategy` and all auth routes) was missing from
  `AppModule` imports — passport reported `Unknown authentication strategy "jwt"` and auth
  endpoints would 404. **Fix:** restored `AuthModule` and `AppController`/`AppService`.

## Security

| Issue | Fix |
|---|---|
| Refresh-token verification scanned **every** token row and ran N bcrypt compares per request (O(N) per auth + DoS vector) | Tokens stored as SHA-256 hashes with an indexed `hash` column; lookup is O(1); bcrypt dropped for refresh tokens |
| Access-token TTL hardcoded in code | Read from config (`JWT_EXPIRES_IN`, default `15m`) |
| `x-organization-id` header trusted by several guards for tenant scoping | Header no longer trusted; org comes from the JWT user or platform-admin scope |
| Verification email sent **inside** the registration DB transaction (a Brevo outage could roll back account creation) | Email sent after commit; token created in-transaction |
| Access guards checked non-existent roles (`OWNER`/`ADMIN`/`AGENT`) and a non-existent `isPlatformAdmin` field | Guards now map real schema roles (`TENANT_OWNER`/`SUPPORT_AGENT`/`CUSTOMER`/`PLATFORM_ADMIN`) |
| No rate limiting on auth endpoints | Global throttler + tight limits on login/register/refresh/reset |
| `console.log` in bootstrap, no graceful shutdown, CORS wide open | Helmet, allow-listed CORS, `enableShutdownHooks`, logger used throughout |
| Inconsistent error responses | Global `HttpExceptionFilter`: consistent `{ success, statusCode, message, error, timestamp, path, requestId }` envelope; Prisma error codes mapped to proper HTTP statuses |

## Performance

- Refresh-token login reduced from O(N) bcrypt to O(1) indexed hash lookup.
- Tenant resolution cached for 60s (subdomain/custom-domain → organization), avoiding a DB hit
  per public portal request.
- Dashboard/analytics queries audited and corrected for scoping and typing.

## Reliability

- Health module: `/health/live` (liveness) and `/health/ready` (DB, storage, email, payment
  provider probes).
- Structured JSON logging (pino); request IDs propagated from `x-request-id`.
- Prisma 7 driver adapter (`@prisma/adapter-pg`) required by the generated client — wired
  through `PrismaService`.

## Testing

- 16 unit suites / 94 tests: utils (password, slug, pagination), policies (ticket, feedback),
  validation utils, auth services (token, refresh-token, password), guards (roles, tenant),
  request-context isolation, logger, health, plus the passport-mixin DI regression spec.
- E2E: full `AppModule` boot against a mocked database (global auth enforcement, public
  liveness, readiness) + standalone health endpoints.

## CI/CD & deployment

- GitHub Actions workflow: prisma validate, lint, build, unit + e2e tests.
- Dockerfile (multi-stage, non-root), `.dockerignore`, `netlify.toml`.

## Operations documentation

- `README.md`, `docs/DEPLOYMENT.md`, `docs/ENVIRONMENT.md`, `docs/ARCHITECTURE.md`.
