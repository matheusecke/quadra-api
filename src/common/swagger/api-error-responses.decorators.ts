import { applyDecorators } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
  getSchemaPath,
} from '@nestjs/swagger';
import { ApiErrorEnvelopeDto } from './api-error-response.dto';

const refExample = (
  statusCode: number,
  title: string,
  message: string,
  code: string,
  data: Record<string, unknown>,
) =>
  ({
    error: { title, message, code, data },
    statusCode,
  }) as const;

const errorSchemaRef = (): object => ({
  allOf: [{ $ref: getSchemaPath(ApiErrorEnvelopeDto) }],
});

export function ApiBadRequestErrorResponse(): MethodDecorator & ClassDecorator {
  return ApiBadRequestResponse({
    description: 'Validation or bad request (ApiException / ValidationPipe).',
    schema: errorSchemaRef(),
    examples: {
      validation: {
        summary: 'Validation error',
        value: refExample(
          400,
          'Bad Request',
          'Invalid data in request.',
          'VALIDATION_ERROR',
          { email: ['email must be an email'] },
        ),
      },
    },
  });
}

export function ApiUnauthorizedErrorResponse(): MethodDecorator &
  ClassDecorator {
  return ApiUnauthorizedResponse({
    description: 'Missing or invalid access token, or invalid credentials.',
    schema: errorSchemaRef(),
    examples: {
      unauthorized: {
        summary: 'Unauthorized',
        value: refExample(
          401,
          'Unauthorized',
          'Refresh token not provided.',
          'UNAUTHORIZED',
          {},
        ),
      },
    },
  });
}

export function ApiForbiddenErrorResponse(): MethodDecorator & ClassDecorator {
  return ApiForbiddenResponse({
    description: 'Authenticated but not allowed for this resource or action.',
    schema: errorSchemaRef(),
    examples: {
      forbidden: {
        summary: 'Forbidden',
        value: refExample(
          403,
          'Forbidden',
          'Insufficient role for this operation.',
          'FORBIDDEN',
          {},
        ),
      },
    },
  });
}

export function ApiNotFoundErrorResponse(): MethodDecorator & ClassDecorator {
  return ApiNotFoundResponse({
    description: 'Resource not found (ApiException or Prisma P2025).',
    schema: errorSchemaRef(),
    examples: {
      notFound: {
        summary: 'Record not found',
        value: refExample(
          404,
          'Not Found',
          'The requested record was not found.',
          'RECORD_NOT_FOUND',
          {},
        ),
      },
    },
  });
}

export function ApiConflictErrorResponse(): MethodDecorator & ClassDecorator {
  return ApiConflictResponse({
    description: 'Unique constraint or business conflict (e.g. Prisma P2002).',
    schema: errorSchemaRef(),
    examples: {
      duplicate: {
        summary: 'Duplicate record',
        value: refExample(
          409,
          'Conflict',
          'A record with this value already exists.',
          'DUPLICATE_RECORD',
          {},
        ),
      },
    },
  });
}

export function ApiUnprocessableEntityErrorResponse(): MethodDecorator &
  ClassDecorator {
  return ApiUnprocessableEntityResponse({
    description: 'Foreign key or integrity issue (e.g. Prisma P2003).',
    schema: errorSchemaRef(),
    examples: {
      fk: {
        summary: 'Foreign key violation',
        value: refExample(
          422,
          'Unprocessable Entity',
          'A referenced record does not exist.',
          'FOREIGN_KEY_VIOLATION',
          {},
        ),
      },
    },
  });
}

/** Typical read/write authenticated routes (not exhaustive per handler). */
export function ApiStandardCrudErrors(): MethodDecorator & ClassDecorator {
  return applyDecorators(
    ApiBadRequestErrorResponse(),
    ApiUnauthorizedErrorResponse(),
    ApiForbiddenErrorResponse(),
    ApiNotFoundErrorResponse(),
    ApiConflictErrorResponse(),
    ApiUnprocessableEntityErrorResponse(),
  );
}
