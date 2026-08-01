import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ApiResponseDto } from '../dto/response.dto';
import { getApiMs, getPerfStore, shouldIncludePerf } from '../utils/performance-context';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: any, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const request = ctx.getRequest();

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let errorDetails: any = undefined;

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const exceptionResponse = exception.getResponse() as any;

      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else if (exceptionResponse?.message) {
        message = Array.isArray(exceptionResponse.message)
          ? 'Validation failed'
          : exceptionResponse.message;
        if (Array.isArray(exceptionResponse.message)) {
          errorDetails = exceptionResponse.message;
        }
      }
    } else if (exception?.code && typeof exception.code === 'string' && exception.code.startsWith('P')) {
      const prismaError = this.mapPrismaError(exception);
      statusCode = prismaError.statusCode;
      message = prismaError.message;
    } else if (exception?.name === 'TokenExpiredError') {
      statusCode = HttpStatus.UNAUTHORIZED;
      message = 'Authentication token has expired';
    } else if (exception?.name === 'JsonWebTokenError') {
      statusCode = HttpStatus.UNAUTHORIZED;
      message = 'Invalid authentication token';
    } else if (exception?.name === 'PayloadTooLargeError') {
      statusCode = HttpStatus.PAYLOAD_TOO_LARGE;
      message = 'Request payload too large';
    } else if (exception?.message) {
      message = exception.message;
    }

    if (statusCode >= 500) {
      this.logger.error(
        `[${request?.method}] ${request?.url} -> ${statusCode}`,
        exception?.stack || exception,
      );
    } else if (statusCode >= 400) {
      this.logger.warn(
        `[${request?.method}] ${request?.url} -> ${statusCode}: ${message}`,
      );
    }

    const includePerf = shouldIncludePerf();
    const store = includePerf ? getPerfStore() : undefined;
    const apiMs = includePerf ? getApiMs() : undefined;
    const meta =
      includePerf && store && typeof apiMs === 'number'
        ? {
            apiMs: Number(apiMs.toFixed(2)),
            dbMs: Number(store.dbMs.toFixed(2)),
            dbQueries: store.dbQueries,
          }
        : undefined;

    const apiResponse = new ApiResponseDto(
      statusCode,
      message,
      undefined,
      errorDetails ? { code: `ERR_${statusCode}`, details: errorDetails } : undefined,
      request?.url,
      meta,
    );

    if (response && typeof response.status === 'function') {
      response.status(statusCode).json(apiResponse);
    } else {
      this.logger.error('No response object available in exception filter', exception?.stack);
    }
  }

  private mapPrismaError(exception: any): { statusCode: number; message: string } {
    const code = exception.code;

    switch (code) {
      case 'P2002':
        return {
          statusCode: HttpStatus.CONFLICT,
          message: `Duplicate value: ${exception?.meta?.target?.join(', ') || 'unique constraint violated'}`,
        };
      case 'P2025':
        return {
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Record not found',
        };
      case 'P2003':
        return {
          statusCode: HttpStatus.BAD_REQUEST,
          message: `Foreign key constraint failed: ${exception?.meta?.field_name || 'invalid reference'}`,
        };
      case 'P2014':
        return {
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Invalid relation: required relation is missing',
        };
      case 'P2001':
        return {
          statusCode: HttpStatus.NOT_FOUND,
          message: 'The requested record does not exist',
        };
      case 'P2021':
        return {
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Database table or column does not exist',
        };
      case 'P2024':
        return {
          statusCode: HttpStatus.SERVICE_UNAVAILABLE,
          message: 'Database connection timeout - please try again',
        };
      case 'P1001':
        return {
          statusCode: HttpStatus.SERVICE_UNAVAILABLE,
          message: 'Cannot reach database server',
        };
      case 'P1002':
        return {
          statusCode: HttpStatus.SERVICE_UNAVAILABLE,
          message: 'Database server timed out',
        };
      case 'P1017':
        return {
          statusCode: HttpStatus.SERVICE_UNAVAILABLE,
          message: 'Server has closed the connection unexpectedly',
        };
      default:
        this.logger.error(`Unhandled Prisma error: ${code}`, exception?.stack);
        return {
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Database operation failed',
        };
    }
  }
}
