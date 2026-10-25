import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common'
import { AuthenticatedRequest } from '../auth/auth.types'

@Injectable()
export class InventoryWriteGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const actor = context
      .switchToHttp()
      .getRequest<AuthenticatedRequest>().authUser
    if (
      actor?.role !== 'OWNER' &&
      !actor?.permissions?.includes('inventory.adjust')
    ) {
      throw new ForbiddenException('Inventory adjustment permission required')
    }
    return true
  }
}
