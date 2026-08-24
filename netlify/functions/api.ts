import 'reflect-metadata';

// Prisma returns BigInt for large integer columns. JSON.stringify throws
// "Do not know how to serialize a BigInt". Serialize BigInt as Number.
(BigInt.prototype as unknown as { toJSON: () => number }).toJSON = function () {
  return Number(this);
};

import serverlessExpress from '@vendia/serverless-express';
import express from 'express';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ExpressAdapter } from '@nestjs/platform-express';
import helmet from 'helmet';
import compression from 'compression';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../../dist/src/app.module';
import { HttpExceptionFilter } from '../../dist/src/common/filters/http-exception.filter';
import { TransformInterceptor } from '../../dist/src/common/interceptors/transform.interceptor';
import { RequestContextService } from '../../dist/src/request-context/request-context.service';

let cachedHandler: any;

/**
 * Resolve the allowed CORS origin from the FRONTEND_URL env var.
 * Falls back to `true` (allow all) when the variable is unset so the
 * function never crashes due to a missing CORS configuration.
 */
function getCorsOrigin(): string | string[] | true {
  const raw = process.env.FRONTEND_URL ?? '';
  const urls = raw
    .split(',')
    .map((s: string) => s.trim())
    .filter(Boolean);
  return urls.length ? urls : true;
}

function corsHeaders(origin: string | string[] | true): Record<string, string> {
  const allowed =
    origin === true
      ? '*'
      : Array.isArray(origin)
        ? origin.join(', ')
        : origin;
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-request-id',
  };
}

async function bootstrap() {
  const expressApp = express();
  const app = await NestFactory.create(AppModule, new ExpressAdapter(expressApp), {
    bufferLogs: true,
    rawBody: true,
  });

  const config = app.get(ConfigService);

  app.getHttpAdapter().getInstance().set('trust proxy', 1);

  const requestContextService = app.get(RequestContextService);
  app.use((req: any, res: any, next: any) => {
    return requestContextService.run(
      {
        requestId: (req.headers['x-request-id'] as string | undefined) ?? randomUUID(),
        request: req,
        response: res,
      },
      () => next(),
    );
  });

  app.use(helmet());
  app.use(compression());

  // CORS — FRONTEND_URL may be a comma-separated list of allowed origins.
  const frontendUrls = String(config.get('FRONTEND_URL') ?? '')
    .split(',')
    .map((s: string) => s.trim())
    .filter(Boolean);

  app.enableCors({
    origin: frontendUrls.length ? frontendUrls : true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-request-id'],
  });

  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new TransformInterceptor());

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      forbidUnknownValues: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  app.setGlobalPrefix('api/v1', { exclude: ['health', 'health/(.*)'] });

  await app.init();

  return serverlessExpress({ app: expressApp });
}

export const handler = async (event: any, context: any) => {
  // Always handle CORS preflight BEFORE touching NestJS so that even
  // a cold-start failure returns proper headers and the browser isn't
  // left with a misleading CORS error.
  const corsOrigin = getCorsOrigin();
  const headers = corsHeaders(corsOrigin);

  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers,
      body: '',
    };
  }

  try {
    if (!cachedHandler) {
      cachedHandler = await bootstrap();
    }
    const response = await cachedHandler(event, context);
    // Merge our CORS headers into every response so the browser is
    // always satisfied, even if NestJS CORS missed an edge case.
    response.headers = { ...headers, ...(response.headers ?? {}) };
    return response;
  } catch (err) {
    console.error('Netlify function bootstrap/handler error:', err);
    return {
      statusCode: 500,
      headers: {
        ...headers,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        statusCode: 500,
        message: 'Internal server error',
        error: err instanceof Error ? err.message : 'Unknown error',
      }),
    };
  }
};
