export default () => ({
  env: process.env.NODE_ENV ?? 'development',

  port: parseInt(process.env.PORT ?? '3001', 10),

  apiUrl: process.env.API_URL,

  logLevel: process.env.LOG_LEVEL ?? 'info',

  database: {
    url: process.env.DATABASE_URL,
  },

  jwt: {
    secret: process.env.JWT_SECRET,
    expiresIn: process.env.JWT_EXPIRES_IN ?? '15m',

    refreshSecret: process.env.JWT_REFRESH_SECRET,
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',
  },

  brevo: {
    apiKey: process.env.BREVO_API_KEY,
    from: process.env.EMAIL_FROM,
  },

  paychangu: {
    secretKey: process.env.PAYCHANGU_SECRET_KEY,
    publicKey: process.env.PAYCHANGU_PUBLIC_KEY,
    // Base URL defaults to the PayChangu API for both sandbox and live;
    // override via PAYCHANGU_BASE_URL when using a gateway/proxy.
    baseUrl: process.env.PAYCHANGU_BASE_URL ?? 'https://api.paychangu.com',
    webhookSecret: process.env.PAYCHANGU_WEBHOOK_SECRET,
    returnUrl: process.env.PAYCHANGU_RETURN_URL,
    callbackUrl: process.env.PAYCHANGU_CALLBACK_URL,
    isSandbox: (process.env.PAYCHANGU_ENV ?? 'sandbox') !== 'live',
  },

  frontend: {
    url: process.env.FRONTEND_URL,
  },

  supabase: {
    url: process.env.SUPABASE_URL,
    anonKey: process.env.SUPABASE_PUBLISHABLE_KEY,
    serviceRoleKey: process.env.SUPABASE_SECRET_KEY,
    bucket: process.env.SUPABASE_BUCKET,
  },

  throttler: {
    ttl: parseInt(process.env.THROTTLE_TTL ?? '60', 10) * 1000,
    limit: parseInt(process.env.THROTTLE_LIMIT ?? '100', 10),
  },
});
