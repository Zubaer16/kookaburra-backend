import {
  BadRequestException,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common'
import { AuthService } from './auth.service'
import { hashPassword } from './password'
import { DatabaseService } from '../database/database.service'
import { JwtService } from '@nestjs/jwt'
import { ConfigService } from '@nestjs/config'
import { Environment } from '../config/environment'

describe('05A-4 customer password change transaction protections', () => {
  async function setup(changedCount = 1) {
    const original = 'Current-password-long-1!'
    const passwordHash = await hashPassword(original)
    const tx = {
      user: {
        updateMany: jest.fn().mockResolvedValue({ count: changedCount }),
      },
      authSession: { updateMany: jest.fn().mockResolvedValue({ count: 2 }) },
      passwordResetChallenge: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      auditEvent: { create: jest.fn().mockResolvedValue({ id: 'audit' }) },
    }
    const client = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'customer-id',
          passwordHash,
          role: 'CUSTOMER',
          status: 'ACTIVE',
          sessionVersion: 0,
        }),
      },
      $transaction: jest.fn(async (run: (t: typeof tx) => Promise<unknown>) =>
        run(tx),
      ),
    }
    const auth = new AuthService(
      { client } as unknown as DatabaseService,
      {} as JwtService,
      {} as ConfigService<Environment, true>,
    )
    return { auth, tx, client, original }
  }

  it('denies incorrect old password without beginning transaction', async () => {
    const s = await setup()
    await expect(
      s.auth.changePassword('customer-id', {
        currentPassword: 'Wrong-password-long-1!',
        newPassword: 'Next-password-long-2!',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException)
    expect(s.client.$transaction).not.toHaveBeenCalled()
  })

  it('denies password reuse without writes', async () => {
    const s = await setup()
    await expect(
      s.auth.changePassword('customer-id', {
        currentPassword: s.original,
        newPassword: s.original,
      }),
    ).rejects.toBeInstanceOf(BadRequestException)
    expect(s.client.$transaction).not.toHaveBeenCalled()
  })

  it('aborts session revoke/audit when concurrent credential update wins', async () => {
    const s = await setup(0)
    await expect(
      s.auth.changePassword('customer-id', {
        currentPassword: s.original,
        newPassword: 'Next-password-long-2!',
      }),
    ).rejects.toBeInstanceOf(ConflictException)
    expect(s.tx.authSession.updateMany).not.toHaveBeenCalled()
    expect(s.tx.passwordResetChallenge.updateMany).not.toHaveBeenCalled()
    expect(s.tx.auditEvent.create).not.toHaveBeenCalled()
  })

  it('uses conditional password write, session fencing and PII-free audit', async () => {
    const s = await setup()
    expect(
      await s.auth.changePassword('customer-id', {
        currentPassword: s.original,
        newPassword: 'Next-password-long-2!',
      }),
    ).toEqual({ changed: true, sessionsRevoked: true })
    expect(s.tx.user.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({ id: 'customer-id', sessionVersion: 0 }),
      data: expect.objectContaining({ sessionVersion: { increment: 1 } }),
    })
    expect(s.tx.authSession.updateMany).toHaveBeenCalledWith({
      where: { userId: 'customer-id', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    })
    expect(s.tx.passwordResetChallenge.updateMany).toHaveBeenCalledWith({
      where: { userId: 'customer-id', consumedAt: null },
      data: { consumedAt: expect.any(Date) },
    })
    expect(s.tx.auditEvent.create).toHaveBeenCalledWith({
      data: {
        actorId: 'customer-id',
        action: 'customer.password_changed',
        targetType: 'user',
        targetId: 'customer-id',
      },
    })
  })
})
