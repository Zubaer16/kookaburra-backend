import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
  ServiceUnavailableException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { DatabaseService } from '../database/database.service'
import { Environment } from '../config/environment'
import type { UserRole } from '../generated/prisma/enums'
import {
  ChangePasswordDto,
  EmailVerificationConfirmDto,
  PasswordResetRequestDto,
  PasswordResetConfirmDto,
  CredentialsDto,
  RefreshDto,
  TokenPairDto,
} from './auth.dto'
import { hashPassword, verifyPassword } from './password'
import { SafeUser } from './auth.types'
import { encryptEmailActionToken } from './email-verification.crypto'

const REFRESH_MS = 30 * 24 * 60 * 60 * 1000
const ACCESS_SECONDS = 15 * 60
const normalize = (email: string): string => email.trim().toLowerCase()
const hashToken = (token: string): string =>
  createHash('sha256').update(token).digest('hex')

@Injectable()
export class AuthService {
  constructor(
    private readonly database: DatabaseService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Environment, true>,
  ) {}

  private async issue(
    user: SafeUser,
    sessionVersion: number,
    familyId = randomUUID(),
  ): Promise<TokenPairDto> {
    const refreshToken = randomBytes(48).toString('base64url')
    await this.database.client.authSession.create({
      data: {
        userId: user.id,
        familyId,
        tokenHash: hashToken(refreshToken),
        sessionVersion,
        expiresAt: new Date(Date.now() + REFRESH_MS),
      },
    })
    return this.pair(user, refreshToken, sessionVersion)
  }

  private async pair(
    user: SafeUser,
    refreshToken: string,
    sessionVersion: number,
  ): Promise<TokenPairDto> {
    const accessToken = await this.jwt.signAsync(
      { sub: user.id, typ: 'access', role: user.role, sv: sessionVersion },
      {
        secret: this.config.get('JWT_ACCESS_SECRET', { infer: true }),
        expiresIn: ACCESS_SECONDS,
        issuer: 'commerce-api',
        audience: 'commerce-clients',
        algorithm: 'HS256',
      },
    )
    return {
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
      expiresIn: ACCESS_SECONDS,
      user,
    }
  }

  async register(dto: CredentialsDto): Promise<TokenPairDto> {
    const email = normalize(dto.email)
    const exists = await this.database.client.user.findUnique({
      where: { email },
    })
    if (exists)
      throw new ConflictException('An account with this email already exists')
    let user
    try {
      user = await this.database.client.user.create({
        data: {
          email,
          passwordHash: await hashPassword(dto.password),
          role: 'CUSTOMER',
        },
      })
    } catch (error: unknown) {
      // Race on a unique email. Do not expose DB details.
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('An account with this email already exists')
      }
      throw error
    }
    return this.issue(
      { id: user.id, email: user.email, role: user.role },
      user.sessionVersion,
    )
  }

  async login(dto: CredentialsDto, adminOnly = false): Promise<TokenPairDto> {
    const user = await this.database.client.user.findUnique({
      where: { email: normalize(dto.email) },
    })
    if (
      !user ||
      user.status !== 'ACTIVE' ||
      (adminOnly ? user.role === 'CUSTOMER' : user.role !== 'CUSTOMER')
    ) {
      throw new UnauthorizedException('Invalid credentials')
    }
    if (!(await verifyPassword(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid credentials')
    }
    await this.database.client.auditEvent.create({
      data: {
        actorId: user.id,
        action: adminOnly ? 'admin.login' : 'customer.login',
        targetType: 'user',
        targetId: user.id,
      },
    })
    return this.issue(
      { id: user.id, email: user.email, role: user.role },
      user.sessionVersion,
    )
  }

  async refresh(dto: RefreshDto): Promise<TokenPairDto> {
    const record = await this.database.client.authSession.findUnique({
      where: { tokenHash: hashToken(dto.refreshToken) },
      include: { user: true },
    })
    if (!record) throw new UnauthorizedException('Invalid refresh token')
    if (record.revokedAt) {
      // Reuse of a rotated token indicates possible compromise; revoke the family.
      await this.database.client.authSession.updateMany({
        where: { familyId: record.familyId, revokedAt: null },
        data: { revokedAt: new Date() },
      })
      throw new UnauthorizedException('Refresh token replay detected')
    }
    if (
      record.expiresAt <= new Date() ||
      record.user.status !== 'ACTIVE' ||
      record.sessionVersion !== record.user.sessionVersion
    ) {
      throw new UnauthorizedException('Refresh token expired or user disabled')
    }
    const refreshToken = randomBytes(48).toString('base64url')
    await this.database.client.$transaction(async (tx) => {
      const consumed = await tx.authSession.updateMany({
        where: {
          id: record.id,
          sessionVersion: record.sessionVersion,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
        data: { revokedAt: new Date() },
      })
      if (consumed.count !== 1)
        throw new UnauthorizedException('Refresh token already used')
      await tx.authSession.create({
        data: {
          userId: record.userId,
          familyId: record.familyId,
          tokenHash: hashToken(refreshToken),
          sessionVersion: record.sessionVersion,
          expiresAt: new Date(Date.now() + REFRESH_MS),
        },
      })
    })
    return this.pair(
      { id: record.user.id, email: record.user.email, role: record.user.role },
      refreshToken,
      record.sessionVersion,
    )
  }

  async logout(dto: RefreshDto): Promise<{ loggedOut: boolean }> {
    const tokenHash = hashToken(dto.refreshToken)
    await this.database.client.authSession.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    })
    return { loggedOut: true }
  }

  async revokeAll(userId: string): Promise<void> {
    await this.database.client.authSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    })
  }

  /** Change a CUSTOMER password without allowing an unauthenticated reset.
   * A compare-and-swap prevents two concurrent changes from both succeeding.
   * Password update, session revocation, and audit are one DB transaction. */
  async changePassword(
    userId: string,
    dto: ChangePasswordDto,
  ): Promise<{ changed: boolean; sessionsRevoked: boolean }> {
    const user = await this.database.client.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        passwordHash: true,
        sessionVersion: true,
        role: true,
        status: true,
      },
    })
    if (
      !user ||
      user.role !== 'CUSTOMER' ||
      user.status !== 'ACTIVE' ||
      !(await verifyPassword(dto.currentPassword, user.passwordHash))
    ) {
      throw new UnauthorizedException('Current password is incorrect')
    }
    if (dto.currentPassword === dto.newPassword)
      throw new BadRequestException('New password must be different')
    const nextHash = await hashPassword(dto.newPassword)
    return this.database.client.$transaction(async (tx) => {
      const updated = await tx.user.updateMany({
        where: {
          id: user.id,
          role: 'CUSTOMER',
          status: 'ACTIVE',
          passwordHash: user.passwordHash,
          sessionVersion: user.sessionVersion,
        },
        data: { passwordHash: nextHash, sessionVersion: { increment: 1 } },
      })
      if (updated.count !== 1)
        throw new ConflictException(
          'Credentials changed; retry with current session',
        )
      await tx.authSession.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      })
      // Changing a known password invalidates outstanding recovery tokens too.
      await tx.passwordResetChallenge.updateMany({
        where: { userId: user.id, consumedAt: null },
        data: { consumedAt: new Date() },
      })
      await tx.auditEvent.create({
        data: {
          actorId: user.id,
          action: 'customer.password_changed',
          targetType: 'user',
          targetId: user.id,
        },
      })
      return { changed: true, sessionsRevoked: true }
    })
  }

  /** G2/05A-5: no public email enumeration and no secret in HTTP/DB plaintext.
   * Per-user row lock serializes resend/confirmation; cooldown is durable.
   * Actual SMTP transport deliberately waits for G7. */
  async requestEmailVerification(
    userId: string,
  ): Promise<{ accepted: boolean }> {
    const key = this.config.get('AUTH_ACTION_TOKEN_ENCRYPTION_KEY', {
      infer: true,
    })
    if (!key)
      throw new ServiceUnavailableException(
        'Email verification delivery is not configured',
      )
    const now = new Date()
    await this.database.client.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId}::uuid FOR UPDATE`
      const user = await tx.user.findUnique({ where: { id: userId } })
      if (!user || user.status !== 'ACTIVE' || user.role !== 'CUSTOMER')
        throw new UnauthorizedException()
      if (user.emailVerifiedAt) return
      const prior = await tx.emailVerificationChallenge.findUnique({
        where: { userId },
      })
      // Silent cooldown: do not reveal previous token or churn the encrypted event.
      if (prior && now.getTime() - prior.requestedAt.getTime() < 60_000) return
      const token = randomBytes(48).toString('base64url')
      const tokenHash = hashToken(token)
      const expiresAt = new Date(now.getTime() + 30 * 60_000)
      await tx.emailVerificationChallenge.upsert({
        where: { userId },
        create: { userId, tokenHash, requestedAt: now, expiresAt },
        update: { tokenHash, requestedAt: now, expiresAt, consumedAt: null },
      })
      const eventId = randomUUID()
      await tx.outboxEvent.create({
        data: {
          id: eventId,
          eventType: 'auth.email_verification.requested',
          payload: {
            userId,
            eventId,
            token: encryptEmailActionToken(key, token, `${userId}:${eventId}`),
            expiresAt: expiresAt.toISOString(),
            // G7 must verify the token hash is still current before sending.
          },
        },
      })
      await tx.auditEvent.create({
        data: {
          actorId: userId,
          action: 'customer.email_verification_requested',
          targetType: 'user',
          targetId: userId,
        },
      })
    })
    return { accepted: true }
  }

  /** One-time consume + mark verified under the same lock used by issuance. */
  async confirmEmailVerification(
    dto: EmailVerificationConfirmDto,
  ): Promise<{ accepted: boolean }> {
    const challenge =
      await this.database.client.emailVerificationChallenge.findUnique({
        where: { tokenHash: hashToken(dto.token) },
        select: { userId: true },
      })
    if (!challenge)
      throw new BadRequestException('Invalid or expired verification token')
    await this.database.client.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${challenge.userId}::uuid FOR UPDATE`
      const current = await tx.emailVerificationChallenge.findUnique({
        where: { userId: challenge.userId },
      })
      const user = await tx.user.findUnique({ where: { id: challenge.userId } })
      const now = new Date()
      if (
        !current ||
        current.tokenHash !== hashToken(dto.token) ||
        current.consumedAt ||
        current.expiresAt <= now ||
        !user ||
        user.role !== 'CUSTOMER' ||
        user.status !== 'ACTIVE' ||
        user.emailVerifiedAt
      )
        throw new BadRequestException('Invalid or expired verification token')
      await tx.emailVerificationChallenge.update({
        where: { userId: challenge.userId },
        data: { consumedAt: now },
      })
      await tx.user.update({
        where: { id: challenge.userId },
        data: { emailVerifiedAt: now },
      })
      await tx.auditEvent.create({
        data: {
          actorId: challenge.userId,
          action: 'customer.email_verified',
          targetType: 'user',
          targetId: challenge.userId,
        },
      })
    })
    return { accepted: true }
  }

  /** Public recovery request. Response is identical for absent, disabled and staff
   * users; per-customer lock + 60s cooldown + five tokens/hour bound abuse.
   * No token enters logs or HTTP. G7 sender MUST revalidate token hash, expiry
   * and recipient identity before using the encrypted outbox payload. */
  async requestPasswordReset(
    dto: PasswordResetRequestDto,
  ): Promise<{ accepted: boolean }> {
    const key = this.config.get('AUTH_ACTION_TOKEN_ENCRYPTION_KEY', {
      infer: true,
    })
    if (!key || !/^[a-fA-F0-9]{64}$/.test(key))
      throw new ServiceUnavailableException(
        'Password recovery delivery is not configured',
      )
    const accepted = { accepted: true }
    const user = await this.database.client.user.findUnique({
      where: { email: normalize(dto.email) },
      select: { id: true, role: true, status: true },
    })
    if (!user || user.role !== 'CUSTOMER' || user.status !== 'ACTIVE')
      return accepted
    await this.database.client.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${user.id}::uuid FOR UPDATE`
      const currentUser = await tx.user.findUnique({
        where: { id: user.id },
        select: { role: true, status: true },
      })
      if (currentUser?.role !== 'CUSTOMER' || currentUser.status !== 'ACTIVE')
        return
      const now = new Date()
      const previous = await tx.passwordResetChallenge.findUnique({
        where: { userId: user.id },
      })
      if (previous && now.getTime() - previous.requestedAt.getTime() < 60_000)
        return
      const withinWindow =
        previous && now.getTime() - previous.windowStartAt.getTime() < 3_600_000
      if (withinWindow && previous.windowCount >= 5) return
      const token = randomBytes(48).toString('base64url')
      const tokenHash = hashToken(token)
      const expiresAt = new Date(now.getTime() + 30 * 60_000)
      await tx.passwordResetChallenge.upsert({
        where: { userId: user.id },
        create: {
          userId: user.id,
          tokenHash,
          expiresAt,
          requestedAt: now,
          windowStartAt: now,
          windowCount: 1,
        },
        update: {
          tokenHash,
          expiresAt,
          requestedAt: now,
          consumedAt: null,
          windowStartAt: withinWindow ? previous!.windowStartAt : now,
          windowCount: withinWindow ? previous!.windowCount + 1 : 1,
        },
      })
      const eventId = randomUUID()
      await tx.outboxEvent.create({
        data: {
          id: eventId,
          eventType: 'auth.password_reset.requested',
          payload: {
            userId: user.id,
            eventId,
            token: encryptEmailActionToken(key, token, `${user.id}:${eventId}`),
            expiresAt: expiresAt.toISOString(),
          },
        },
      })
      await tx.auditEvent.create({
        data: {
          actorId: user.id,
          action: 'customer.password_reset_requested',
          targetType: 'user',
          targetId: user.id,
        },
      })
    })
    return accepted
  }

  /** One-time token consumption, password swap, session fencing + audit are
   * atomic. Original password is never disclosed; consumed token cannot replay. */
  async confirmPasswordReset(dto: PasswordResetConfirmDto): Promise<{
    changed: boolean
    sessionsRevoked: boolean
  }> {
    const tokenHash = hashToken(dto.token)
    const challenge =
      await this.database.client.passwordResetChallenge.findUnique({
        where: { tokenHash },
        select: { userId: true, expiresAt: true, consumedAt: true },
      })
    if (!challenge || challenge.consumedAt || challenge.expiresAt <= new Date())
      throw new BadRequestException('Invalid or expired reset token')
    // Do expensive scrypt work only after a candidate token has been found.
    const nextHash = await hashPassword(dto.newPassword)
    return this.database.client.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${challenge.userId}::uuid FOR UPDATE`
      const current = await tx.passwordResetChallenge.findUnique({
        where: { userId: challenge.userId },
      })
      const user = await tx.user.findUnique({
        where: { id: challenge.userId },
        select: { id: true, role: true, status: true, passwordHash: true },
      })
      if (
        !current ||
        current.tokenHash !== tokenHash ||
        current.consumedAt ||
        current.expiresAt <= new Date() ||
        !user ||
        user.role !== 'CUSTOMER' ||
        user.status !== 'ACTIVE'
      )
        throw new BadRequestException('Invalid or expired reset token')
      if (await verifyPassword(dto.newPassword, user.passwordHash))
        throw new BadRequestException('New password must be different')
      const now = new Date()
      await tx.passwordResetChallenge.update({
        where: { userId: user.id },
        data: { consumedAt: now },
      })
      await tx.user.update({
        where: { id: user.id },
        data: { passwordHash: nextHash, sessionVersion: { increment: 1 } },
      })
      await tx.authSession.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: now },
      })
      await tx.auditEvent.create({
        data: {
          actorId: user.id,
          action: 'customer.password_reset_completed',
          targetType: 'user',
          targetId: user.id,
        },
      })
      return { changed: true, sessionsRevoked: true }
    })
  }

  // For future permission-scoped RBAC; only role enforcement is live in this phase.
  static isStaff(role: UserRole): boolean {
    return role !== 'CUSTOMER'
  }
}
