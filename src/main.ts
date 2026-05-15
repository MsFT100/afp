import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import * as express from 'express';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log', 'debug', 'verbose'],
  });
  // Enable raw body parsing for webhook signature verification
  // Only for paths that need it, or globally if simpler
  app.use(express.json({ verify: (req: any, res, buf) => { req.rawBody = buf; } }));
  app.useGlobalPipes(new ValidationPipe());

  app.enableCors({
    origin: true, // Set to true to reflect the request origin, or use an array of strings for production
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
    optionsSuccessStatus: 204,
  });

  await app.listen(process.env.PORT ?? 8000);
}
bootstrap().catch(() => {});
