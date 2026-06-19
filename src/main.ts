import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { PrismaExceptionFilter } from './common/filters/prisma-exception.filter';
import { ApiExceptionFilter } from './common/filters/api-exception.filter';
import { validationExceptionFactory } from './common/pipes/validation.factory';
import {
  PaginationLinks,
  PaginationMeta,
} from './common/dto/pagination-response.dto';
import {
  ApiErrorBodyDto,
  ApiErrorEnvelopeDto,
} from './common/swagger/api-error-response.dto';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  // Middleware
  app.use(cookieParser());

  // Enable graceful shutdown hooks (required for PrismaService.$disconnect)
  app.enableShutdownHooks();

  // CORS — credentials: true is required for the httpOnly refresh token cookie
  app.enableCors({
    origin: process.env['CORS_ORIGIN'] ?? 'http://localhost:5173',
    credentials: true,
  });

  // Global pipes
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: validationExceptionFactory,
    }),
  );

  // Global filters — NestJS applies global filters in reverse registration order
  // (last registered = first to execute). ApiExceptionFilter is last → runs first.
  app.useGlobalFilters(new PrismaExceptionFilter(), new ApiExceptionFilter());

  // Swagger
  const swaggerDescription = [
    'Basketball championship multi-tenant API.',
    '',
    '**Authentication:** send `Authorization: Bearer <access_token>`. Session flows also rely on the httpOnly `refreshToken` cookie set by login, register, token refresh, and choose-organization.',
    '',
    '**Pagination:** list endpoints that support pagination accept `page` and `limit` query parameters (typical defaults: page 1, limit 10).',
    '',
    '**Errors:** most error responses use `{ error: { title, message, code, data }, statusCode }`.',
  ].join('\n');

  const swaggerConfig = new DocumentBuilder()
    .setTitle('tcc-api')
    .setDescription(swaggerDescription)
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description:
          'JWT access token from login/register, or org-scoped token from POST /auth/org.',
      },
      'bearer',
    )
    .addCookieAuth(
      'refreshToken',
      {
        type: 'apiKey',
        description:
          'HttpOnly refresh cookie. Sent automatically by the browser when calling session endpoints (e.g. refresh, logout, choose-org) with credentials.',
      },
      'refreshToken',
    )
    .addTag(
      'auth',
      'Registration, credentials, token refresh, org-scoped access, and password change.',
    )
    .addTag(
      'users',
      'Platform user directory and administration (system admin operations).',
    )
    .addTag(
      'organizations',
      'Tenant organizations: create, list, update, status, and soft delete.',
    )
    .addTag(
      'teams',
      'Global team registry and lifecycle (system admin for writes).',
    )
    .addTag(
      'organization-user-affiliations',
      'User membership in organizations: invites, roles, jersey numbers, and status.',
    )
    .addTag(
      'organization-team-affiliations',
      'Team linkage to organizations: invites and affiliation status.',
    )
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig, {
    extraModels: [
      ApiErrorEnvelopeDto,
      ApiErrorBodyDto,
      PaginationMeta,
      PaginationLinks,
    ],
  });
  SwaggerModule.setup('api', app, document);

  await app.listen(process.env['PORT'] ?? 3001);
}

void bootstrap();
