import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET must be set in production — refusing to start.');
  }

  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  app.enableCors({
    origin: process.env.WEB_ORIGIN ? process.env.WEB_ORIGIN.split(',') : /^http:\/\/localhost:\d+$/,
    allowedHeaders: ['Content-Type', 'Authorization'],
  });
  app.enableShutdownHooks();
  await app.listen(process.env.PORT ? Number(process.env.PORT) : 4000);
}
bootstrap();
