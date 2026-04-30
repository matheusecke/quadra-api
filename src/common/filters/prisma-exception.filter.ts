import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpStatus,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Response } from 'express';

@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter {
  catch(exception: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL_ERROR';
    let title = 'Internal Server Error';
    let message = 'An unexpected error occurred.';

    switch (exception.code) {
      case 'P2002':
        statusCode = HttpStatus.CONFLICT;
        code = 'DUPLICATE_RECORD';
        title = 'Conflict';
        message = 'A record with this value already exists.';
        break;
      case 'P2003':
        statusCode = HttpStatus.UNPROCESSABLE_ENTITY;
        code = 'FOREIGN_KEY_VIOLATION';
        title = 'Unprocessable Entity';
        message = 'A referenced record does not exist.';
        break;
      case 'P2025':
        statusCode = HttpStatus.NOT_FOUND;
        code = 'RECORD_NOT_FOUND';
        title = 'Not Found';
        message = 'The requested record was not found.';
        break;
    }

    response.status(statusCode).json({
      error: { title, message, code, data: {} },
      statusCode,
    });
  }
}
