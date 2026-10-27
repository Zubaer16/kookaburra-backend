import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common'
import { AuthenticatedRequest } from '../auth/auth.types'

@Injectable()
export class CheckoutOwnerGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const actor = context
      .switchToHttp()
      .getRequest<AuthenticatedRequest>().authUser
    if (actor?.role !== 'OWNER')
      throw new ForbiddenException(
        'Only the store owner may manage checkout tax and shipping policies',
      )
    return true
  }
}
