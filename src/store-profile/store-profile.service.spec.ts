import { BadRequestException } from '@nestjs/common'
import type { DatabaseService } from '../database/database.service'
import { StoreProfileService } from './store-profile.service'

const dto = {
  storeName: '  Example Shop ',
  supportEmail: 'SUPPORT@EXAMPLE.COM',
  websiteUrl: 'https://shop.example.com',
  timezone: 'UTC' as const,
  supportNotice: ' Questions welcome. ',
}

describe('G3/05B-1 store profile service', () => {
  it('does not invent demo branding for an unconfigured installation', async () => {
    const db = {
      client: {
        storeProfile: { findUnique: jest.fn().mockResolvedValue(null) },
      },
    }
    const service = new StoreProfileService(db as unknown as DatabaseService)
    expect(await service.publicProfile()).toEqual({
      configured: false,
      storeName: null,
      supportEmail: null,
      websiteUrl: '',
      timezone: null,
      supportNotice: '',
    })
  })

  it('serializes persisted profile and PII-free audit in one transaction', async () => {
    const upsert = jest
      .fn()
      .mockImplementation(async ({ create }: { create: object }) => ({
        ...create,
        updatedAt: new Date('2026-10-30T00:00:00.000Z'),
      }))
    const audit = jest.fn().mockResolvedValue({})
    const db = {
      client: {
        $transaction: (callback: (tx: unknown) => Promise<unknown>) =>
          callback({ storeProfile: { upsert }, auditEvent: { create: audit } }),
      },
    }
    const service = new StoreProfileService(db as unknown as DatabaseService)
    expect(await service.put(dto, 'owner-id')).toMatchObject({
      configured: true,
      storeName: 'Example Shop',
      supportEmail: 'support@example.com',
      supportNotice: 'Questions welcome.',
    })
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { key: 'primary' },
        create: expect.objectContaining({
          key: 'primary',
          storeName: 'Example Shop',
        }),
      }),
    )
    expect(audit).toHaveBeenCalledWith({
      data: {
        actorId: 'owner-id',
        action: 'store.profile.updated',
        targetType: 'store_profile',
        targetId: 'primary',
      },
    })
  })

  it.each([
    'https://user:pass@example.com',
    'https://example.com?ref=secret',
    'https://example.com/#redirect',
    'https://example.com:444',
  ])(
    'rejects unsafe metadata URL without any database write: %s',
    async (url) => {
      const write = jest.fn()
      const service = new StoreProfileService({
        client: { $transaction: write },
      } as unknown as DatabaseService)
      await expect(
        service.put({ ...dto, websiteUrl: url }, 'owner-id'),
      ).rejects.toThrow(BadRequestException)
      expect(write).not.toHaveBeenCalled()
    },
  )
})
