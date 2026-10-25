import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common'
import { AuthenticatedRequest } from '../auth/auth.types'

/** Server-resolved per-request permissions, never the JWT role claim alone. */
@Injectable()
export class CatalogWriteGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const actor = context
      .switchToHttp()
      .getRequest<AuthenticatedRequest>().authUser
    if (
      actor?.role !== 'OWNER' &&
      !actor?.permissions?.includes('catalog.manage')
    ) {
      throw new ForbiddenException('Catalog write permission required')
    }
    return true
  }
}
