import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { AppConfig } from './config/configuration';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService).get<AppConfig>('app')!;

  app.setGlobalPrefix('api');
  app.enableCors({
    origin: [config.webOrigin],
    credentials: true,
    allowedHeaders: ['Authorization', 'Content-Type', 'x-dev-upn'],
  });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  await app.listen(config.port, '0.0.0.0');
  new Logger('Bootstrap').log(`API listening on :${config.port} (auth: ${config.authMode})`);
}
bootstrap();
