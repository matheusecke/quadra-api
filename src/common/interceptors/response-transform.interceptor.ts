import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  HttpStatus,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { PaginationResponseDto } from '../dto/pagination-response.dto';

export const SKIP_RESPONSE_TRANSFORM = 'skipResponseTransform';

export const SkipResponseTransform = () =>
  SetMetadata(SKIP_RESPONSE_TRANSFORM, true);

function isPaginatedResponse(data: unknown): data is PaginationResponseDto<unknown> {
  return (
    typeof data === 'object' &&
    data !== null &&
    'data' in data &&
    'meta' in data &&
    'links' in data
  );
}

@Injectable()
export class ResponseTransformInterceptor<T>
  implements NestInterceptor<T, { data: T; statusCode: number } | PaginationResponseDto<unknown> | T>
{
  constructor(private readonly reflector: Reflector) {}

  intercept(
    context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<{ data: T; statusCode: number } | PaginationResponseDto<unknown> | T> {
    const skip = this.reflector.getAllAndOverride<boolean>(
      SKIP_RESPONSE_TRANSFORM,
      [context.getHandler(), context.getClass()],
    );

    if (skip) {
      return next.handle();
    }

    const response = context.switchToHttp().getResponse<{ statusCode: number }>();

    return next.handle().pipe(
      map((data) => {
        if (isPaginatedResponse(data)) {
          return data;
        }

        return {
          data,
          statusCode: response.statusCode ?? HttpStatus.OK,
        };
      }),
    );
  }
}
