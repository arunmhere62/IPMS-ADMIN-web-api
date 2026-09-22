import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  RequestTimeoutException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, throwError, TimeoutError } from 'rxjs';
import { catchError, timeout } from 'rxjs/operators';
import { REQUEST_TIMEOUT_KEY } from '../decorators/request-timeout.decorator';

@Injectable()
export class TimeoutInterceptor implements NestInterceptor {
  private readonly defaultTimeoutMs = 30000;

  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const metadataTimeoutMs = this.reflector.getAllAndOverride<number>(REQUEST_TIMEOUT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const timeoutMs = metadataTimeoutMs || request?.routeOptions?.timeoutMs || this.defaultTimeoutMs;

    return next.handle().pipe(
      timeout(timeoutMs),
      catchError((err) => {
        if (err instanceof TimeoutError) {
          throw new RequestTimeoutException('Request timeout - the server took too long to respond');
        }
        return throwError(() => err);
      }),
    );
  }
}
