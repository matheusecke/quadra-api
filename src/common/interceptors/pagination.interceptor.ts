import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { Request } from 'express';
import {
  PaginationMeta,
  PaginationLinks,
  PaginationResponseDto,
} from '../dto/pagination-response.dto';

interface PaginatedServiceResult<T> {
  count: number;
  data: T[];
}

@Injectable()
export class PaginationInterceptor<T> implements NestInterceptor<
  PaginatedServiceResult<T>,
  PaginationResponseDto<T>
> {
  intercept(
    context: ExecutionContext,
    next: CallHandler<PaginatedServiceResult<T>>,
  ): Observable<PaginationResponseDto<T>> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context
      .switchToHttp()
      .getResponse<{ statusCode: number }>();

    const page = parseInt(String(request.query['page'] ?? '1'), 10) || 1;
    const limit = parseInt(String(request.query['limit'] ?? '10'), 10) || 10;

    return next.handle().pipe(
      map(({ count, data }) => {
        const meta = new PaginationMeta(count, limit, page);
        const baseUrl = `${request.protocol}://${request.get('host')}${request.path}`;

        const queryIndex = request.originalUrl.indexOf('?');
        const rawQuery =
          queryIndex === -1 ? '' : request.originalUrl.slice(queryIndex + 1);
        const buildLink = (targetPage: number): string => {
          const params = new URLSearchParams(rawQuery);
          params.set('page', String(targetPage));
          params.set('limit', String(limit));
          return `${baseUrl}?${params.toString()}`;
        };

        const links: PaginationLinks = {
          first: buildLink(1),
          previous: page > 1 ? buildLink(page - 1) : null,
          next: page < meta.totalPages ? buildLink(page + 1) : null,
          last: buildLink(meta.totalPages),
        };

        return { data, meta, links, statusCode: response.statusCode ?? 200 };
      }),
    );
  }
}
