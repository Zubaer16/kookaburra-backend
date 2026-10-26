import sharp from 'sharp'
import type { ConfigService } from '@nestjs/config'
import type { Environment } from '../config/environment'
import type { DatabaseService } from '../database/database.service'
import type { DiskMediaProvider } from './disk.storage'
import type { S3MediaProvider } from './s3.storage'
import { MediaRenditionService } from './media-rendition.service'

describe('03C-2C2 actual image processing and durable outbox', () => {
  it('writes byte-backed WebP widths and publishes manifest only after all writes succeed', async () => {
    const source = await sharp({
      create: { width: 640, height: 480, channels: 3, background: '#345678' },
    })
      .png()
      .toBuffer()
    const id = 'dc58c2dc-903f-412b-92c6-0b88c9d041f4'
    const media = {
      id,
      provider: 'disk',
      namespace: 'projects/kookaburra/products',
      objectKey: `projects/kookaburra/products/${id}`,
      status: 'ACTIVE',
      renditions: null,
      width: 640,
      height: 480,
      mimeType: 'image/png',
      bytes: source.length,
    }
    const writes: Array<{ width: number; data: Buffer }> = []
    const storage = {
      readSource: jest.fn().mockResolvedValue(source),
      writeRendition: jest
        .fn()
        .mockImplementation(
          async (_key: string, width: number, data: Buffer) => {
            writes.push({ width, data })
          },
        ),
    }
    const updateMany = jest
      .fn()
      .mockResolvedValueOnce({ count: 0 }) // stale-job recovery
      .mockResolvedValueOnce({ count: 1 }) // claim
    const outboxUpdate = jest.fn().mockResolvedValue({})
    const saveManifest = jest.fn().mockResolvedValue({})
    const db = {
      client: {
        outboxEvent: {
          updateMany,
          findMany: jest.fn().mockResolvedValue([
            {
              id,
              attempts: 0,
              status: 'PENDING',
            },
          ]),
          update: outboxUpdate,
        },
        mediaAsset: { findUnique: jest.fn().mockResolvedValue(media) },
        $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
          fn({
            mediaAsset: {
              findUnique: jest.fn().mockResolvedValue(media),
              update: saveManifest,
            },
            outboxEvent: { update: outboxUpdate },
          }),
      },
    } as unknown as DatabaseService
    const cfg = {
      get: (key: string) =>
        key === 'MEDIA_NAMESPACE' ? media.namespace : undefined,
    } as ConfigService<Environment, true>
    const service = new MediaRenditionService(
      db,
      cfg,
      {} as S3MediaProvider,
      storage as unknown as DiskMediaProvider,
    )
    expect(await service.processBatch(1)).toEqual({
      processed: 1,
      failed: 0,
      skipped: 0,
    })
    expect(writes.map((w) => w.width)).toEqual([320, 480, 640])
    for (const item of writes) {
      const image = await sharp(item.data).metadata()
      expect(image.format).toBe('webp')
      expect(image.width).toBe(item.width)
    }
    expect(saveManifest).toHaveBeenCalledTimes(1)
    expect(saveManifest.mock.calls[0][0].data.renditions).toEqual(
      writes.map(({ width, data }) => ({ width, bytes: data.length })),
    )
    expect(outboxUpdate).toHaveBeenCalledWith({
      where: { id },
      data: { status: 'COMPLETED' },
    })
  })
})
