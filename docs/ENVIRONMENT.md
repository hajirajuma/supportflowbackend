# Environment Variables

All variables are validated at boot with Joi — missing or malformed values abort startup
(except where a default exists). See `.env.example` for a working template.

## Application

| Variable | Required | Default | Description |
|---|---|---|---|
| `NODE_ENV` | no | `development` | `development` \| `test` \| `production` |
| `PORT` | no | `3001` | HTTP listen port |
| `API_URL` | no | — | Public base URL of the API (webhook callbacks) |
| `LOG_LEVEL` | no | `info` | pino level: `fatal` `error` `warn` `info` `debug` `trace` `silent` |
| `FRONTEND_URL` | **yes** | — | Comma-separated list of allowed CORS origins |

## Database

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | **yes** | PostgreSQL connection string (Neon compatible) |

## Auth

| Variable | Required | Default | Description |
|---|---|---|---|
| `JWT_SECRET` | **yes** | — | Access-token signing secret (**min 32 chars**) |
| `JWT_EXPIRES_IN` | no | `15m` | Access-token TTL (`15m`, `1h`, `7d`, …) |
| `JWT_REFRESH_SECRET` | **yes** | — | Refresh-token signing secret (**min 32 chars**) |
| `JWT_REFRESH_EXPIRES_IN` | no | `7d` | Refresh-token TTL |

## Email (Brevo)

| Variable | Required | Description |
|---|---|---|
| `BREVO_API_KEY` | **yes** | Brevo API key |
| `EMAIL_FROM` | **yes** | Verified sender email |

## Payments (PayChangu)

| Variable | Required | Description |
|---|---|---|
| `PAYCHANGU_ENV` | no (`sandbox`) | `sandbox` \| `live` |
| `PAYCHANGU_SECRET_KEY` | live only | Required when `PAYCHANGU_ENV=live` |
| `PAYCHANGU_PUBLIC_KEY` | live only | Required when `PAYCHANGU_ENV=live` |
| `PAYCHANGU_WEBHOOK_SECRET` | live only | Webhook signature verification secret |
| `PAYCHANGU_BASE_URL` | no | API base URL (defaults to `https://api.paychangu.com`) |
| `PAYCHANGU_RETURN_URL` | no | Post-checkout redirect URL |
| `PAYCHANGU_CALLBACK_URL` | no | Webhook/callback URL registered with PayChangu |

## Storage (Supabase)

| Variable | Required | Description |
|---|---|---|
| `SUPABASE_URL` | **yes** | Project URL (`https://<ref>.supabase.co`) |
| `SUPABASE_PUBLISHABLE_KEY` | **yes** | Anon / publishable key |
| `SUPABASE_SECRET_KEY` | **yes** | Service-role key (server-side only, never expose) |
| `SUPABASE_BUCKET` | **yes** | Default storage bucket |

## Rate limiting

| Variable | Required | Default | Description |
|---|---|---|---|
| `THROTTLE_TTL` | no | `60` | Global window in **seconds** |
| `THROTTLE_LIMIT` | no | `100` | Global requests per window |

Auth endpoints carry tighter per-route limits: register `5/min`, login `10/min`, refresh
`30/min`, forgot/reset/verify-password `5–10/min`.
