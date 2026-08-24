import * as Joi from 'joi';

const ttlPattern = /^(\d+\s*(s|m|h|d)|0)$/;

export default Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .default('development'),

  PORT: Joi.number().integer().min(1).max(65535).default(3001),

  API_URL: Joi.string().uri().optional(),

  LOG_LEVEL: Joi.string()
    .valid('fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent')
    .default('info'),

  DATABASE_URL: Joi.string().required(),

  JWT_SECRET: Joi.string().min(32).required(),
  JWT_EXPIRES_IN: Joi.string().pattern(ttlPattern).default('15m'),

  JWT_REFRESH_SECRET: Joi.string().min(32).required(),
  JWT_REFRESH_EXPIRES_IN: Joi.string().pattern(ttlPattern).default('7d'),

  BREVO_API_KEY: Joi.string().required(),
  EMAIL_FROM: Joi.string().email().required(),

  // PayChangu keys are optional in sandbox but mandatory in live mode.
  PAYCHANGU_SECRET_KEY: Joi.string().when('PAYCHANGU_ENV', {
    is: 'live',
    then: Joi.required(),
    otherwise: Joi.optional(),
  }),
  PAYCHANGU_PUBLIC_KEY: Joi.string().when('PAYCHANGU_ENV', {
    is: 'live',
    then: Joi.required(),
    otherwise: Joi.optional(),
  }),
  PAYCHANGU_WEBHOOK_SECRET: Joi.string().when('PAYCHANGU_ENV', {
    is: 'live',
    then: Joi.required(),
    otherwise: Joi.optional(),
  }),
  PAYCHANGU_ENV: Joi.string().valid('sandbox', 'live').default('sandbox'),
  PAYCHANGU_BASE_URL: Joi.string().uri().optional(),
  PAYCHANGU_RETURN_URL: Joi.string().uri().optional(),
  PAYCHANGU_CALLBACK_URL: Joi.string().uri().optional(),

  FRONTEND_URL: Joi.string().optional().allow(''),

  SUPABASE_URL: Joi.string().uri().required(),
  SUPABASE_PUBLISHABLE_KEY: Joi.string().required(),
  SUPABASE_SECRET_KEY: Joi.string().required(),
  SUPABASE_BUCKET: Joi.string().required(),

  // Optional: when unset, the throttler and other tunables use defaults.
  THROTTLE_TTL: Joi.number().integer().min(1).optional(),
  THROTTLE_LIMIT: Joi.number().integer().min(1).optional(),
});
