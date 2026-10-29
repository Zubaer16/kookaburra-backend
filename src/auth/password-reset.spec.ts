import { BadRequestException } from '@nestjs/common'
import { AuthService } from './auth.service'
import { DatabaseService } from '../database/database.service'
import { JwtService } from '@nestjs/jwt'
import { ConfigService } from '@nestjs/config'
import { Environment } from '../config/environment'

describe('05A-6 password recovery invariants', () => {
  const key = 'ab'.repeat(32)
  const make = (client: unknown) =>
    new AuthService(
      { client } as DatabaseService,
      {} as JwtService,
      { get: jest.fn().mockReturnValue(key) } as unknown as ConfigService<
        Environment,
        true
      >,
    )
  it('does not enumerate unknown accounts', async () => {
    const client = {
      user: { findUnique: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn(),
    }
    expect(
      await make(client).requestPasswordReset({
        email: 'unknown@example.test',
      }),
    ).toEqual({ accepted: true })
    expect(client.$transaction).not.toHaveBeenCalled()
  })
  it('rejects invented tokens before hashing a new password or mutating DB', async () => {
    const client = {
      passwordResetChallenge: { findUnique: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn(),
    }
    await expect(
      make(client).confirmPasswordReset({
        token: 'a'.repeat(64),
        newPassword: 'New-password-long-123!',
      }),
    ).rejects.toBeInstanceOf(BadRequestException)
    expect(client.$transaction).not.toHaveBeenCalled()
  })
  it('no staff token is issued', async () => {
    const client = {
      user: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: 'staff', role: 'OWNER', status: 'ACTIVE' }),
      },
      $transaction: jest.fn(),
    }
    expect(
      await make(client).requestPasswordReset({ email: 'staff@example.test' }),
    ).toEqual({ accepted: true })
    expect(client.$transaction).not.toHaveBeenCalled()
  })
})
