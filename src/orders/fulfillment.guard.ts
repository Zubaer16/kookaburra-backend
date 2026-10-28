import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common'
import { AuthenticatedRequest } from '../auth/auth.types'

@Injectable()
export class FulfillmentManageGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const actor = context
      .switchToHttp()
      .getRequest<AuthenticatedRequest>().authUser
    if (
      actor?.role !== 'OWNER' &&
      !actor?.permissions?.includes('orders.manage')
    ) {
      throw new ForbiddenException('orders.manage permission required')
    }
    return true
  }
}
