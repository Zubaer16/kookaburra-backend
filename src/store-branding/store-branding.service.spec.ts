import { ConflictException } from '@nestjs/common'
import type { ConfigService } from '@nestjs/config'
import type { DatabaseService } from '../database/database.service'
import type { Environment } from '../config/environment'
import { StoreBrandingService } from './store-branding.service'

const config = {
  get: () => 'projects/kookaburra/products',
} as unknown as ConfigService<Environment, true>
const id = '43d638d0-504e-4023-a4f4-914e29b76a31'

describe('G3/05B-3 branding service', () => {
  it('has no fixture logo or secret when branding absent', async () => {
    const service = new StoreBrandingService(
      {
        client: {
          storeBranding: { findUnique: jest.fn().mockResolvedValue(null) },
        },
      } as unknown as DatabaseService,
      config,
    )
    expect(await service.publicBranding()).toEqual({
      configured: false,
      logo: null,
      favicon: null,
    })
    expect(await service.adminBranding()).toEqual({
      configured: false,
      logo: null,
      favicon: null,
      revision: 0,
      updatedAt: null,
    })
  })
  it('never exposes unverified media URL/provider identity', async () => {
    const asset = {
      id,
      status: 'PENDING_DELETE',
      publicUrl: 'https://cdn.example.test/foo',
      providerAssetId: 'secret',
      mimeType: 'image/png',
      width: 64,
      height: 64,
      bytes: 500,
    }
    const service = new StoreBrandingService(
      {
        client: {
          storeBranding: {
            findUnique: jest
              .fn()
              .mockResolvedValue({
                revision: 3,
                updatedAt: new Date('2026-10-30T00:00:00Z'),
                logoMedia: asset,
                faviconMedia: null,
              }),
          },
        },
      } as unknown as DatabaseService,
      config,
    )
    expect(await service.publicBranding()).toEqual({
      configured: true,
      logo: null,
      favicon: null,
    })
  })
  it('stale revision does not write audit', async () => {
    const audit = jest.fn()
    const service = new StoreBrandingService(
      {
        client: {
          $transaction: (callback: (tx: unknown) => Promise<unknown>) =>
            callback({
              storeBranding: {
                updateMany: jest.fn().mockResolvedValue({ count: 0 }),
              },
              auditEvent: { create: audit },
            }),
        },
      } as unknown as DatabaseService,
      config,
    )
    await expect(
      service.save(
        { expectedRevision: 12, logoMediaId: null, faviconMediaId: null },
        id,
      ),
    ).rejects.toThrow(ConflictException)
    expect(audit).not.toHaveBeenCalled()
  })
})
