import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import { DatabaseService } from '../database/database.service'
import { Environment } from '../config/environment'
import { AuthenticatedRequest } from './auth.types'
import { PermissionsService } from './permissions.service'

@Injectable()
export class AccessGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly database: DatabaseService,
    private readonly config: ConfigService<Environment, true>,
    private readonly permissions: PermissionsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>()
    const match = /^Bearer (\S+)$/i.exec(req.headers.authorization ?? '')
    if (!match) throw new UnauthorizedException('Valid bearer token required')
    let payload: { sub?: string; typ?: string; sv?: number }
    try {
      payload = await this.jwt.verifyAsync<{
        sub: string
        typ: string
        sv?: number
      }>(match[1]!, {
        secret: this.config.get('JWT_ACCESS_SECRET', { infer: true }),
        issuer: 'commerce-api',
        audience: 'commerce-clients',
        algorithms: ['HS256'],
      })
    } catch {
      throw new UnauthorizedException('Invalid or expired access token')
    }
    if (payload.typ !== 'access' || !payload.sub)
      throw new UnauthorizedException()
    const user = await this.database.client.user.findUnique({
      where: { id: payload.sub },
    })
    if (!user || user.status !== 'ACTIVE')
      throw new UnauthorizedException('Account disabled or missing')
    // Legacy JWTs predate sv and implicitly have epoch 0. After password
    // change, all old access tokens fail immediately, not just refresh tokens.
    if ((payload.sv ?? 0) !== user.sessionVersion)
      throw new UnauthorizedException('Session expired; sign in again')
    const resolved = await this.permissions.resolve(user)
    req.authUser = {
      id: user.id,
      email: user.email,
      role: user.role,
      ...resolved,
    }
    return true
  }
}
