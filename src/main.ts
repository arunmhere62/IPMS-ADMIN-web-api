import 'tsconfig-paths/register';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import * as bodyParser from 'body-parser';
import { GlobalExceptionFilter } from './common/filters/http-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { PerformanceInterceptor } from './common/interceptors/performance.interceptor';
import { TimeoutInterceptor } from './common/interceptors/timeout.interceptor';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { registerProcessErrorHandlers, registerGracefulShutdown } from './common/utils/process-error-handler';
import { validateEnvironment } from './common/utils/env-validation';
import { AppLogger } from './common/utils/app-logger';

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  registerProcessErrorHandlers();

  const envCheck = validateEnvironment();
  if (!envCheck.valid) {
    logger.error('FATAL: Missing required environment variables. Server cannot start.');
    logger.error(`Missing: ${envCheck.missing.join(', ')}`);
    process.exit(1);
  }

  const app = await NestFactory.create(AppModule, {
    bufferLogs: false,
    logger: AppLogger.getInstance(),
  });

  app.enableShutdownHooks();

  app.use(bodyParser.json({ limit: '50mb' }));
  app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));

  app.setGlobalPrefix('api/web/v1');

  app.enableCors({
    origin: true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-user-id'],
    exposedHeaders: ['Authorization'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  app.useGlobalFilters(new GlobalExceptionFilter());

  app.useGlobalInterceptors(
    new LoggingInterceptor(),
    new TimeoutInterceptor(),
    new PerformanceInterceptor(),
    new TransformInterceptor(),
  );

  const config = new DocumentBuilder()
    .setTitle('Web API')
    .setDescription('Web API - Health endpoints')
    .setVersion('1.0')
    .addTag('health', 'Health check endpoints')
    .addTag('s3', 'S3 file operations')
    .addTag('organizations', 'Organization endpoints')
    .addTag('subscription-plans', 'Subscription plan endpoints')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
    },
  });

  const port = process.env.PORT || 5002;

  registerGracefulShutdown(async () => {
    logger.log('Closing HTTP server...');
    await app.close();
    logger.log('HTTP server closed.');
  });

  await app.listen(port);

  logger.log(`Application is running on: http://localhost:${port}`);
  logger.log(`Swagger documentation: http://localhost:${port}/api/docs`);
  logger.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
}

bootstrap().catch((err) => {
  const logger = new Logger('Bootstrap');
  logger.error(`Failed to start application: ${err?.message}`, err?.stack);
  process.exit(1);
});
