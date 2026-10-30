import { ConflictException } from '@nestjs/common'
import type { DatabaseService } from '../database/database.service'
import { StoreContentService } from './store-content.service'

const input = {
  expectedRevision: 0,
  seoTitle: '  New shop  ',
  seoDescription: '',
  footerText: '',
  privacyPolicy: ' Privacy\nPolicy ',
  termsOfService: '',
  returnPolicy: '',
}
const sample = {
  key: 'primary',
  revision: 1,
  seoTitle: 'New shop',
  seoDescription: '',
  footerText: '',
  privacyPolicy: 'Privacy\nPolicy',
  termsOfService: '',
  returnPolicy: '',
  updatedAt: new Date('2026-10-30T00:00:00Z'),
}

describe('G3/05B-2 store public content service', () => {
  it('returns explicit unconfigured content without branding or legal fiction', async () => {
    const service = new StoreContentService({
      client: {
        storeContent: { findUnique: jest.fn().mockResolvedValue(null) },
      },
    } as unknown as DatabaseService)
    expect(await service.adminContent()).toEqual({
      configured: false,
      seoTitle: '',
      seoDescription: '',
      footerText: '',
      privacyPolicy: '',
      termsOfService: '',
      returnPolicy: '',
      revision: 0,
      updatedAt: null,
    })
  })
  it('atomically creates initial revision and non-content audit', async () => {
    const create = jest.fn().mockResolvedValue(sample)
    const audit = jest.fn().mockResolvedValue({})
    const service = new StoreContentService({
      client: {
        $transaction: (callback: (tx: unknown) => Promise<unknown>) =>
          callback({ storeContent: { create }, auditEvent: { create: audit } }),
      },
    } as unknown as DatabaseService)
    expect(await service.save(input, 'owner-id')).toMatchObject({
      configured: true,
      revision: 1,
      seoTitle: 'New shop',
    })
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        key: 'primary',
        revision: 1,
        seoTitle: 'New shop',
      }),
    })
    expect(audit).toHaveBeenCalledWith({
      data: {
        actorId: 'owner-id',
        action: 'store.content.updated',
        targetType: 'store_content',
        targetId: 'primary',
      },
    })
  })
  it('stale revision conflicts without audit', async () => {
    const audit = jest.fn()
    const service = new StoreContentService({
      client: {
        $transaction: (callback: (tx: unknown) => Promise<unknown>) =>
          callback({
            storeContent: {
              updateMany: jest.fn().mockResolvedValue({ count: 0 }),
            },
            auditEvent: { create: audit },
          }),
      },
    } as unknown as DatabaseService)
    await expect(
      service.save({ ...input, expectedRevision: 23 }, 'actor'),
    ).rejects.toThrow(ConflictException)
    expect(audit).not.toHaveBeenCalled()
  })
})
