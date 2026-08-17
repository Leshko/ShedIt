import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { logger: ['log', 'warn', 'error'] });

  app.enableCors({
    origin: process.env.WEB_ORIGIN ?? 'http://localhost:3000',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
  });

  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port, '0.0.0.0');

  const logger = new Logger('ShedIt');
  logger.log(`API listening on http://localhost:${port}`);
  logger.log(
    process.env.MONGO_URL
      ? 'Project persistence: enabled'
      : 'Project persistence: disabled (set MONGO_URL to save projects)',
  );
}

void bootstrap();
