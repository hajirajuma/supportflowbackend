# Deployment Guide

## Before you deploy

1. Provision a managed PostgreSQL (Neon, Supabase, RDS) and set `DATABASE_URL`.
2. Generate secrets with `openssl rand -hex 32` for `JWT_SECRET` and `JWT_REFRESH_SECRET`.
3. Create the Supabase bucket (`supportflow`) with private + public paths as configured in
   `SupabaseStorageService`.
4. Verify the Brevo sender (`EMAIL_FROM`) and set `BREVO_API_KEY`.
5. Set PayChangu to `live` only after verifying webhooks in sandbox. Register
   `PAYCHANGU_CALLBACK_URL` (e.g. `https://api.yourdomain.com/api/v1/payments/webhook`).

## Database migrations

```bash
npx prisma migrate deploy   # applies migrations in prisma/migrations
npm run prisma:seed         # platform admin, plans, permissions, roles, KB categories
```

> Run migrations from your CI/CD pipeline before/after deploy — do not run them from the app
> process at boot in production.

## Render

`render.yaml` is included; you can use it as a Blueprint, or create a Web Service manually:

- **Runtime:** Node
- **Build command:** `npm ci && npx prisma generate && npm run build`
- **Start command:** `node dist/main.js`
- **Health check path:** `/health/ready`
- **Environment:** all variables from [ENVIRONMENT.md](ENVIRONMENT.md)

## Railway

`railway.json` is included (Nixpacks):

- Build: `npm ci && npx prisma generate && npm run build`
- Start: `node dist/main.js`
- Healthcheck: `/health/ready`

Add a PostgreSQL plugin and bind `DATABASE_URL`; add the remaining env vars via the dashboard.

## Docker

```bash
docker build -t supportflow-backend .
docker run -p 3001:3001 --env-file .env supportflow-backend
```

The image is multi-stage, runs as a non-root user, and ships production dependencies only.
Push it to a registry and run on any container platform (Fly.io, ECS, GKE, …).

## Reverse proxy notes

- The app trusts `X-Forwarded-For` (`trust proxy = 1`) so logs reflect the real client IP.
- Health checks `/health/live` and `/health/ready` are exposed **without** the `api/v1`
  prefix; keep them publicly reachable for orchestrators.
- Swagger (`/docs`) is disabled in `NODE_ENV=production`; enable behind basic auth if needed
  by adding a gateway rule.
- Use HTTPS everywhere; set HSTS via your proxy or the Helmet defaults already enabled.

## Post-deploy checklist

- [ ] `/health/live` returns 200 and `/health/ready` reports `ready`
- [ ] A public knowledge-base page resolves the tenant via subdomain
- [ ] Register → email verification email arrives (Brevo)
- [ ] A sandbox checkout → PayChangu webhook activates the subscription
- [ ] Refresh-token flow works across restarts (hashed tokens are persisted)
- [ ] `x-request-id` appears in structured logs
