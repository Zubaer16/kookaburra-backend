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
  const app = await NestFactory.create(AppModule, { rawBody: true })
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
      'X-Media-Upload-Token',
      'X-Guest-Cart-Token',
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
      .addApiKey(
        {
          type: 'apiKey',
          in: 'header',
          name: 'X-Guest-Cart-Token',
          description:
            'Opaque anonymous guest-cart capability. Separate from customer JWT.',
        },
        'guest-cart-token',
      )
      .addTag('System / Health', 'Health liveness and status')
      .addTag('Authentication / Customer', 'Customer identity and sessions')
      .addTag(
        'Authentication / Admin',
        'Back-office identity (no public staff sign-up)',
      )
      .addTag(
        'Store Bootstrap / Public',
        'Safe profile, content and verified branding in a single public response',
      )
      .addTag(
        'Catalog / Storefront',
        'Public categories and active product catalogue',
      )
      .addTag(
        'Catalog / Admin',
        'Protected category, product and variant management',
      )
      .addTag(
        'Inventory / Admin',
        'SKU stock ledger, adjustments and thresholds',
      )
      .addTag(
        'Media / Admin',
        'Verified image uploads, product galleries and safe deletion',
      )
      .addTag(
        'Media / Disk',
        'VPS-only signed raw uploads and published media delivery',
      )
      .addTag(
        'Cart / Customer',
        'Customer-owned persistent cart and live server-side quote (no reservation)',
      )
      .addTag(
        'Wishlist / Customer',
        'Private product bookmarks and safe merge from a local preview wishlist',
      )
      .addTag(
        'Account / Customer',
        'Authenticated customer display-name profile and private saved address book',
      )
      .addTag(
        'Cart / Guest',
        'Anonymous cart capability and one-time secure merge (no JWT authentication)',
      )
      .addTag(
        'Checkout / Customer',
        'Country-aware estimate and 10-minute inventory hold; no order/payment',
      )
      .addTag(
        'Orders / Customer',
        'Owned immutable unpaid orders, pending allocation and safe cancellation',
      )
      .addTag(
        'Orders / Admin',
        'Permission-gated paid order processing and single-shipment tracking',
      )
      .addTag(
        'Returns / Customer',
        'Customer return requests for paid delivered order lines',
      )
      .addTag(
        'Returns / Admin',
        'Permission-gated inspection and controlled stock restocking',
      )
      .addTag(
        'Tracking / Customer',
        'Authenticated order-UUID tracking of original shipment and recovery',
      )
      .addTag(
        'Tracking / Admin',
        'Permission-gated fulfillment, return and replacement read projection',
      )
      .addTag(
        'Payments / Customer',
        'Stripe TEST intent preparation; verified settlement is operator-worker-only; card confirmation disabled',
      )
      .addTag(
        'Payments / Admin',
        'OWNER-approved refund ledger; explicit TEST-only worker verifies provider refunds; no automatic restock',
      )
      .addTag(
        'Payments / Webhooks',
        'Signed Stripe test event receipts; provider-verified settlement via explicit reconciliation worker',
      )
      .addTag(
        'Checkout / Admin',
        'OWNER-only country/currency shipping and estimate tax policies',
      )
      .addTag(
        'Customers / Admin',
        'Permission-gated customer directory, search and non-financial order overview',
      )
      .addTag(
        'Store Profile / Public',
        'Public white-label identity, support and safe website URL',
      )
      .addTag(
        'Store Profile / Admin',
        'OWNER-managed single-installation store profile',
      )
      .addTag(
        'Store Content / Public',
        'Plain-text SEO, footer and legal policy publication',
      )
      .addTag(
        'Store Content / Admin',
        'OWNER-only revision-checked content management',
      )
      .addTag(
        'Store Branding / Public',
        'Public verified logo and favicon media references',
      )
      .addTag(
        'Store Branding / Admin',
        'OWNER-only revision-safe Media Library branding bindings',
      )
      .addTag(
        'Workspace / Admin',
        'JWT-only staff workspace roles and persistent permission grants',
      )
      .build()
    const document = SwaggerModule.createDocument(app, docConfig)
    // Guest capability is declared as an OpenAPI apiKey *security scheme*.
    // Some Swagger metadata sources may still emit a second editable header
    // parameter for the same value. Swagger UI then blocks Execute with
    // "Required field is not provided" even after Authorize succeeds.
    // Normalize the documentation only; HTTP authentication is unchanged.
    const isGuestCapabilityParameter = (parameter: unknown): boolean =>
      typeof parameter === 'object' &&
      parameter !== null &&
      'in' in parameter &&
      parameter.in === 'header' &&
      'name' in parameter &&
      typeof parameter.name === 'string' &&
      parameter.name.toLowerCase() === 'x-guest-cart-token'
    const guestProtectedOperations = [
      ['get', '/v1/guest-cart'],
      ['get', '/v1/guest-cart/quote'],
      ['put', '/v1/guest-cart/items'],
      ['delete', '/v1/guest-cart/items/{id}'],
      ['delete', '/v1/guest-cart/items'],
      ['delete', '/v1/guest-cart'],
    ] as const
    for (const [method, path] of guestProtectedOperations) {
      const pathItem = document.paths[path]
      const operation = pathItem?.[method]
      if (!operation)
        throw new Error(
          `Swagger guest cart operation missing: ${method.toUpperCase()} ${path}`,
        )
      if (pathItem.parameters) {
        pathItem.parameters = pathItem.parameters.filter(
          (parameter) => !isGuestCapabilityParameter(parameter),
        )
      }
      if (operation.parameters) {
        operation.parameters = operation.parameters.filter(
          (parameter) => !isGuestCapabilityParameter(parameter),
        )
      }
      operation.security = [{ 'guest-cart-token': [] }]
    }
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
