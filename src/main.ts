import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { PrismaExceptionFilter } from './common/filters/prisma-exception.filter';
import { ApiExceptionFilter } from './common/filters/api-exception.filter';
import { validationExceptionFactory } from './common/pipes/validation.factory';

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
  const swaggerConfig = new DocumentBuilder()
    .setTitle('tcc-api')
    .setDescription('Basketball Organization Multi-tenant API')
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api', app, document);

  await app.listen(process.env['PORT'] ?? 3001);
}

bootstrap();
