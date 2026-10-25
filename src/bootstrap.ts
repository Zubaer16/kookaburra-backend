import 'reflect-metadata'
import { INestApplication, ValidationPipe } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { NestFactory } from '@nestjs/core'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import helmet from 'helmet'
import { AppModule } from './app.module'
import { Environment } from './config/environment'
import { requestLogger } from './http/request-logger.middleware'

/** Identical bootstrap for Vercel, VPS, tests, and local development. */
export async function createHttpApp(): Promise<INestApplication> {
  const app = await NestFactory.create(AppModule)
  const config = app.get(ConfigService<Environment, true>)
  const mode = config.get('NODE_ENV', { infer: true })
  const origins = config
    .get('CORS_ORIGINS', { infer: true })
    .split(',')
    .filter(Boolean)

  app.use(requestLogger)
  // Swagger UI requires inline assets locally. Production CSP stays enforced.
  app.use(
    helmet({
      contentSecurityPolicy: mode === 'production' ? undefined : false,
    }),
  )
  app.enableCors({
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Accept',
      'Authorization',
      'X-CSRF-Token',
      'Idempotency-Key',
    ],
    origin(
      origin: string | undefined,
      callback: (error: Error | null, allow?: boolean) => void,
    ) {
      callback(null, !origin || origins.includes(origin))
    },
  })
  app.setGlobalPrefix('v1')
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  )

  if (config.get('SWAGGER_ENABLED', { infer: true })) {
    const docConfig = new DocumentBuilder()
      .setTitle('E-commerce API')
      .setDescription(
        'Module-grouped documentation. Only displayed routes are implemented; database-backed authentication requires DATABASE_URL.',
      )
      .setVersion('0.2.0')
      .addBearerAuth(
        { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        'access-token',
      )
      .addTag('System / Health', 'Health liveness and status')
      .addTag('Authentication / Customer', 'Customer identity and sessions')
      .addTag(
        'Authentication / Admin',
        'Back-office identity (no public staff sign-up)',
      )
      .addTag(
        'Catalog / Storefront',
        'Public categories and active product catalogue',
      )
      .addTag(
        'Catalog / Admin',
        'Protected category, product and variant management',
      )
      .build()
    const document = SwaggerModule.createDocument(app, docConfig)
    SwaggerModule.setup('docs', app, document, {
      swaggerOptions: {
        persistAuthorization: false,
        // Keep Swagger tags in DocumentBuilder.addTag order (Health first).
        operationsSorter: 'alpha',
      },
    })
  }
  return app
}
