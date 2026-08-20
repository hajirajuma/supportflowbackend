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

## Netlify (Serverless Functions)

The backend is deployed as a **Netlify Function**. The build uses esbuild to bundle the
NestJS app into a single serverless function.

**Build command:** `bash scripts/build-netlify.sh`

**Environment variables** (set in Netlify dashboard → Site settings → Environment variables):

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | *(your PostgreSQL connection string)* |
| `JWT_SECRET` | *(random hex string)* |
| `JWT_REFRESH_SECRET` | *(random hex string)* |
| `FRONTEND_URL` | `https://your-frontend.vercel.app` |
| `API_URL` | `https://your-backend.netlify.app` |
| `BREVO_API_KEY` | *(your Brevo key)* |
| `EMAIL_FROM` | `SupportFlow <no-reply@yourdomain.com>` |
| `SUPABASE_URL` | *(your Supabase URL)* |
| `SUPABASE_PUBLISHABLE_KEY` | *(your Supabase anon key)* |
| `SUPABASE_SECRET_KEY` | *(your Supabase service role key)* |
| `SUPABASE_BUCKET` | `supportflow` |
| `PAYCHANGU_ENV` | `sandbox` or `live` |
| `PAYCHANGU_PUBLIC_KEY` | *(your PayChangu key)* |
| `PAYCHANGU_SECRET_KEY` | *(your PayChangu key)* |

**Routing:** The `netlify.toml` routes all `/api/*` requests to the serverless function.

**Limitations:**
- Cold starts may take 10-20 seconds after idle
- WebSocket support not available (use external WebSocket provider)
- 10-second timeout on free tier (26s on paid)

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
