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

  app.enableCors();
  const config = app.get(ConfigService);
  const logger = app.get(LoggerService);
  app.useLogger(logger);

  const requestContextService = app.get(RequestContextService);

  // Behind reverse proxies (Render/Railway), honor X-Forwarded-For for
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

  // Global validation
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

  // Health endpoints stay at the root so orchestrators don't need the prefix.
  app.setGlobalPrefix('api/v1', { exclude: ['health', 'health/(.*)'] });

  // Swagger (never exposed in production)
  if (config.get('NODE_ENV') !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('SupportFlow API')
      .setDescription('SupportFlow SaaS Backend')
      .setVersion('1.0')
      .addBearerAuth()
      .addServer('/api/v1')
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('docs', app, document);
  }

  // Graceful shutdown for in-flight requests + DB connection draining
  app.enableShutdownHooks();

  const port = config.get<number>('PORT') ?? 3001;
  await app.listen(port);

  logger.log(
    `Server running on http://localhost:${port} (env: ${config.get('NODE_ENV') ?? 'development'})`,
    'Bootstrap',
  );
}

bootstrap().catch((error) => {
  console.error('Fatal error during bootstrap:', error);
  process.exit(1);
});
