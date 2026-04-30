import { HttpException, HttpStatus } from '@nestjs/common';

export class ApiException extends HttpException {
  constructor(
    statusCode: number,
    title: string,
    message: string,
    code: string,
    data: Record<string, unknown> = {},
  ) {
    super({ error: { title, message, code, data }, statusCode }, statusCode);
  }

  static notFound(message: string, code = 'RECORD_NOT_FOUND'): ApiException {
    return new ApiException(HttpStatus.NOT_FOUND, 'Not Found', message, code);
  }

  static conflict(message: string, code = 'DUPLICATE_RECORD'): ApiException {
    return new ApiException(HttpStatus.CONFLICT, 'Conflict', message, code);
  }

  static unprocessable(message: string, code = 'UNPROCESSABLE_ENTITY'): ApiException {
    return new ApiException(
      HttpStatus.UNPROCESSABLE_ENTITY,
      'Unprocessable Entity',
      message,
      code,
    );
  }

  static forbidden(message: string, code = 'FORBIDDEN'): ApiException {
    return new ApiException(HttpStatus.FORBIDDEN, 'Forbidden', message, code);
  }

  static unauthorized(message: string, code = 'UNAUTHORIZED'): ApiException {
    return new ApiException(HttpStatus.UNAUTHORIZED, 'Unauthorized', message, code);
  }

  static badRequest(
    message: string,
    code = 'BAD_REQUEST',
    data: Record<string, unknown> = {},
  ): ApiException {
    return new ApiException(HttpStatus.BAD_REQUEST, 'Bad Request', message, code, data);
  }
}
