import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { CustomerCartGuard } from '../cart/cart.customer.guard'
import { AccountController } from './account.controller'
import { AccountService } from './account.service'

@Module({
  imports: [AuthModule],
  controllers: [AccountController],
  providers: [AccountService, CustomerCartGuard],
})
export class AccountModule {}
