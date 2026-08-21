import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import compression from 'compression';
import { randomUUID } from 'node:crypto';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

import { AppModule } from './app.module';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { RequestContextService } from './request-context/request-context.service';
import { LoggerService } from './logger/logger.service';

// Prisma returns BigInt for large integer columns (e.g. subscription_plans.storageLimitBytes).
// JSON.stringify throws "Do not know how to serialize a BigInt", which 500s every endpoint
// that returns raw Prisma rows (subscription plans, file aggregates, ...). Serialize BigInt
// as a Number so those payloads survive; values fit comfortably within Number.MAX_SAFE_INTEGER.
(BigInt.prototype as unknown as { toJSON: () => number }).toJSON = function () {
  return Number(this);
};

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
    rawBody: true,
  });

  const config = app.get(ConfigService);
  const logger = app.get(LoggerService);
  app.useLogger(logger);

  const requestContextService = app.get(RequestContextService);

  // Behind reverse proxies, honor X-Forwarded-For for
  // request.ip so audit/security logging reflects the real client.
  app.getHttpAdapter().getInstance().set('trust proxy', 1);

  // Request-context bootstrap: captures a requestId and exposes the
  // AsyncLocalStorage scope for the whole request lifecycle. User/tenant data
  // is populated later by JwtAuthGuard from the authenticated user's database
  // record — there is no host-header/subdomain tenant resolution.
  app.use((req, res, next) => {
    const request = req;

    return requestContextService.run(
      {
        requestId:
          (request.headers['x-request-id'] as string | undefined) ??
          randomUUID(),
        request,
        response: res,
      },
      () => next(),
    );
  });

  // Security headers
  app.use(helmet());

  // Response compression
  app.use(compression());

  // CORS
const frontendUrls = String(config.get('FRONTEND_URL') ?? '')
  .split(',')
  .map((url) => url.trim().replace(/\/$/, ''))
  .filter(Boolean);

const allowedOrigins = [
  'https://supportflowm-one.vercel.app',
  'http://localhost:3000',
  'http://localhost:5173',
  ...frontendUrls,
].filter((origin, index, array) => array.indexOf(origin) === index);

app.enableCors({
  origin: (origin, callback) => {
    // Allow requests with no Origin header
    // (health checks, server-to-server requests, etc.)
    if (!origin) {
      return callback(null, true);
    }

    const normalizedOrigin = origin.replace(/\/$/, '');

    if (allowedOrigins.includes(normalizedOrigin)) {
      return callback(null, true);
    }

    logger.warn(
      `CORS blocked origin: ${origin}`,
      'CORS',
    );

    return callback(new Error('Not allowed by CORS'), false);
  },
  credentials: true,
  methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'Accept',
    'Origin',
    'X-Requested-With',
    'x-request-id',
  ],
  exposedHeaders: ['x-request-id'],
  optionsSuccessStatus: 204,
});
}