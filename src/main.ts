import * as dotenv from 'dotenv';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe } from '@nestjs/common';
import { json } from 'express';
import { randomUUID } from 'crypto';

// Polyfill for crypto.randomUUID if not available
if (!global.crypto) {
  global.crypto = {
    randomUUID: () => randomUUID(),
  } as any;
}

dotenv.config();

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  const configService = app.get(ConfigService);

  app.enableCors({
    origin: '*',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    preflightContinue: false,
  });

  // Configure JSON parsing for all other routes
  app.use(json());

  app.useGlobalPipes(
    new ValidationPipe({
      /* transform: true,
      whitelist: true,
      forbidNonWhitelisted: false, */
    }),
  );
  // app.useGlobalFilters(new GlobalExceptionFilter());

  // Apply the encryption interceptor globally
  // app.useGlobalInterceptors(new EncryptionInterceptor());

  const port = configService.get<number>('PORT') || 8080;
  await app.listen(port);
}
bootstrap();
