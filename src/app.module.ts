import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { validateEnvironment } from './config/environment'
import { HealthModule } from './health/health.module'
import { DatabaseModule } from './database/database.module'
import { AuthModule } from './auth/auth.module'
import { CatalogModule } from './catalog/catalog.module'
import { InventoryModule } from './inventory/inventory.module'
import { MediaModule } from './media/media.module'

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnvironment }),
    HealthModule,
    DatabaseModule,
    AuthModule,
    CatalogModule,
    InventoryModule,
    MediaModule,
  ],
})
export class AppModule {}
