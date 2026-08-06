import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

interface ErrorEnvelope {
  success: false;
  statusCode: number;
  message: string | string[];
  error: string;
  details?: unknown;
  timestamp: string;
  path: string;
  requestId?: string;
}

function isPrismaKnownError(
  exception: unknown,
): exception is { code: string; meta?: Record<string, unknown> } {
  return (
    typeof exception === 'object' &&
    exception !== null &&
    typeof (exception as { code?: unknown }).code === 'string' &&
    /^P\d{4}$/.test((exception as { code: string }).code)
  );
}

function resolvePrismaError(code: string): {
  status: number;
  message: string;
} {
  switch (code) {
    case 'P2002':
      return {
        status: HttpStatus.CONFLICT,
        message: 'A record with the same unique value already exists.',
      };
    case 'P2003':
      return {
        status: HttpStatus.BAD_REQUEST,
        message: 'The referenced record does not exist.',
      };
    case 'P2025':
      return {
        status: HttpStatus.NOT_FOUND,
        message: 'The requested record was not found.',
      };
    case 'P2014':
    case 'P2015':
    case 'P2016':
      return {
        status: HttpStatus.BAD_REQUEST,
        message: 'Invalid relational reference in the request.',
      };
    case 'P2000':
    case 'P2001':
      return {
        status: HttpStatus.BAD_REQUEST,
        message: 'The request contains an invalid value.',
      };
    default:
      return {
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Internal Server Error',
      };
  }
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const { statusCode, message, error, details } = this.resolve(exception);

    if (statusCode >= 500) {
      this.logger.error(
        `${request.method} ${request.url} -> ${statusCode}: ${
          exception instanceof Error ? exception.message : String(exception)
        }`,
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    const requestId =
      (request.headers['x-request-id'] as string | undefined) ??
      (request as { requestId?: string }).requestId;

    const body: ErrorEnvelope = {
      success: false,
      statusCode,
      message,
      error,
      timestamp: new Date().toISOString(),
      path: request.url,
    };

    if (details !== undefined) {
      body.details = details;
    }
    if (requestId) {
      body.requestId = requestId;
    }

    response.status(statusCode).json(body);
  }

  private resolve(exception: unknown): {
    statusCode: number;
    message: string | string[];
    error: string;
    details?: unknown;
  } {
    if (exception instanceof HttpException) {
      const statusCode = exception.getStatus();
      const res = exception.getResponse();

      if (typeof res === 'string') {
        return { statusCode, message: res, error: this.statusName(statusCode) };
      }

      const body = res as Record<string, unknown>;
      const rawMessage = body.message ?? exception.message;
      const message = Array.isArray(rawMessage)
        ? rawMessage.map(String)
        : String(rawMessage);

      return {
        statusCode,
        message,
        error:
          typeof body.error === 'string'
            ? body.error
            : this.statusName(statusCode),
        details: body.details,
      };
    }

    if (isPrismaKnownError(exception)) {
      const mapped = resolvePrismaError(exception.code);
      return {
        statusCode: mapped.status,
        message: mapped.message,
        error: this.statusName(mapped.status),
        details: { prismaCode: exception.code },
      };
    }

    if (exception instanceof Error) {
      this.logger.debug(exception.message);
    }

    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Internal Server Error',
      error: HttpStatus[HttpStatus.INTERNAL_SERVER_ERROR] as string,
    };
  }

  private statusName(status: number): string {
    return HttpStatus[status] ?? 'Error';
  }
}
