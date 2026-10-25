import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common'
import { AuthenticatedRequest } from '../auth/auth.types'

/** Temporary coarse policy: STAFF can inspect catalog; only OWNER/ADMIN can mutate it.
 * Phase 02 does not yet have a persisted per-permission RBAC matrix. */
@Injectable()
export class CatalogWriteGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const role = context.switchToHttp().getRequest<AuthenticatedRequest>()
      .authUser?.role
    if (role !== 'OWNER' && role !== 'ADMIN') {
      throw new ForbiddenException('Catalog write permission required')
    }
    return true
  }
}
