import { plainToInstance, type ClassConstructor } from 'class-transformer'
import { validate } from 'class-validator'
import { ReplaceProductGalleryDto, StartMediaUploadDto } from './media.dto'

const errors = async <T extends object>(
  obj: unknown,
  klass: ClassConstructor<T>,
) => validate(plainToInstance(klass, obj))

describe('03C upload and gallery validation', () => {
  it('accepts valid image upload and rejects oversized/non-image', async () => {
    expect(
      await errors(
        { mimeType: 'image/webp', bytes: 32000 },
        StartMediaUploadDto,
      ),
    ).toHaveLength(0)
    expect(
      (
        await errors(
          { mimeType: 'image/svg+xml', bytes: 5 },
          StartMediaUploadDto,
        )
      ).length,
    ).toBeGreaterThan(0)
    expect(
      (
        await errors(
          { mimeType: 'image/jpeg', bytes: 10485761 },
          StartMediaUploadDto,
        )
      ).length,
    ).toBeGreaterThan(0)
  })

  it('rejects repeated media IDs, invalid UUIDs and oversized galleries', async () => {
    const id = '11111111-1111-4111-8111-111111111111'
    expect(
      await errors(
        { items: [{ mediaId: id, position: 0, altText: 'Front' }] },
        ReplaceProductGalleryDto,
      ),
    ).toHaveLength(0)
    expect(
      (
        await errors(
          {
            items: [
              { mediaId: id, position: 0, altText: '' },
              { mediaId: id, position: 1, altText: '' },
            ],
          },
          ReplaceProductGalleryDto,
        )
      ).length,
    ).toBeGreaterThan(0)
    expect(
      (
        await errors(
          { items: [{ mediaId: 'no', position: 8, altText: 'x'.repeat(251) }] },
          ReplaceProductGalleryDto,
        )
      ).length,
    ).toBeGreaterThan(0)
    expect(
      (
        await errors(
          {
            items: Array.from({ length: 7 }, (_, i) => ({
              mediaId: `11111111-1111-4111-8111-11111111111${i}`,
              position: i,
              altText: 'x',
            })),
          },
          ReplaceProductGalleryDto,
        )
      ).length,
    ).toBeGreaterThan(0)
  })
})
