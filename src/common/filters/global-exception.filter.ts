import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { AppError } from '../errors/app.error';
import { ERROR_CODES } from '../errors/error-codes';
import { logger } from '../logger/logger';
import { ErrorCode } from '../errors/error-codes';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();

    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code: ErrorCode = ERROR_CODES.INTERNAL_ERROR;
    let message = 'Internal server error';

    if (exception instanceof AppError) {
      status = exception.statusCode;
      code = exception.code;
      message = exception.message;
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();

      const res = exception.getResponse();

      message =
        typeof res === 'string' ? res : ((res as any)?.message ?? message);

      code = ERROR_CODES.UNKNOWN;
    } else {
      logger.error({
        type: 'UNHANDLED_EXCEPTION',
        error: exception,
        path: request.url,
      });
    }

    const errorResponse = {
      success: false,
      code,
      message,
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
    };

    logger.error({
      type: 'HTTP_ERROR',
      status,
      code,
      message,
      path: request.url,
      method: request.method,
      ip: request.ip,
    });

    response.status(status).json(errorResponse);
  }
}
