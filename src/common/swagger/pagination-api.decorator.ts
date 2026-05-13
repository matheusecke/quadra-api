import { applyDecorators, Type } from '@nestjs/common';
import { ApiExtraModels, ApiOkResponse, getSchemaPath } from '@nestjs/swagger';
import {
  PaginationLinks,
  PaginationMeta,
} from '../dto/pagination-response.dto';

export function ApiPaginatedOkResponse<TModel extends Type<unknown>>(
  itemModel: TModel,
  description = 'Paginated list with `data`, `meta`, `links`, and `statusCode`.',
): MethodDecorator & ClassDecorator {
  return applyDecorators(
    ApiExtraModels(PaginationMeta, PaginationLinks, itemModel),
    ApiOkResponse({
      description,
      schema: {
        type: 'object',
        required: ['data', 'meta', 'links', 'statusCode'],
        properties: {
          data: {
            type: 'array',
            items: { $ref: getSchemaPath(itemModel) },
          },
          meta: { $ref: getSchemaPath(PaginationMeta) },
          links: { $ref: getSchemaPath(PaginationLinks) },
          statusCode: { type: 'number', example: 200 },
        },
      },
    }),
  );
}
