import { Module } from '@nestjs/common'
import { JwtModule } from '@nestjs/jwt'
import { AuthService } from './auth.service'
import { AccessGuard } from './access.guard'
import { AdminGuard } from './admin.guard'
import { AdminAuthController } from './admin-auth.controller'
import { CustomerAuthController } from './customer-auth.controller'

@Module({
  imports: [JwtModule.register({})],
  controllers: [CustomerAuthController, AdminAuthController],
  providers: [AuthService, AccessGuard, AdminGuard],
  exports: [JwtModule, AccessGuard, AdminGuard],
})
export class AuthModule {}
