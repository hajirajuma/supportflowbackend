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
  if (!cachedHandler) {
    cachedHandler = await bootstrap();
  }
  return cachedHandler(event, context);
};
