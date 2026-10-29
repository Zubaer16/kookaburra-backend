import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { validateEnvironment } from './config/environment'
import { HealthModule } from './health/health.module'
import { DatabaseModule } from './database/database.module'
import { AuthModule } from './auth/auth.module'
import { CatalogModule } from './catalog/catalog.module'
import { InventoryModule } from './inventory/inventory.module'
import { MediaModule } from './media/media.module'
import { CartModule } from './cart/cart.module'
import { CheckoutModule } from './checkout/checkout.module'
import { OrdersModule } from './orders/orders.module'
import { PaymentsModule } from './payments/payments.module'
import { WishlistModule } from './wishlist/wishlist.module'
import { AccountModule } from './account/account.module'

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnvironment }),
    HealthModule,
    DatabaseModule,
    AuthModule,
    CatalogModule,
    InventoryModule,
    MediaModule,
    CartModule,
    CheckoutModule,
    OrdersModule,
    PaymentsModule,
    WishlistModule,
    AccountModule,
  ],
})
export class AppModule {}
