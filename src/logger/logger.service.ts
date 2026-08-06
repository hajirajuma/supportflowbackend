import { Injectable, LoggerService as NestLoggerService } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';

type Context = Record<string, unknown> | string | undefined;

function normalizeContext(context?: Context): Record<string, unknown> {
  if (typeof context === 'string') {
    return { context };
  }
  return context ?? {};
}

@Injectable()
export class LoggerService implements NestLoggerService {
  constructor(private readonly logger: PinoLogger) {}

  log(message: string, context?: string) {
    this.logger.info(context ? { context } : {}, message);
  }

  info(message: string, context?: Context) {
    this.logger.info(normalizeContext(context), message);
  }

  warn(message: string, context?: Context) {
    this.logger.warn(normalizeContext(context), message);
  }

  error(message: string, context?: Context) {
    this.logger.error(normalizeContext(context), message);
  }

  debug(message: string, context?: Context) {
    this.logger.debug(normalizeContext(context), message);
  }

  verbose(message: string, context?: string) {
    this.logger.trace(context ? { context } : {}, message);
  }
}
