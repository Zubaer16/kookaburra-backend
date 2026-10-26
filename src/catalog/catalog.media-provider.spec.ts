import { DatabaseService } from '../database/database.service'
import { CatalogService } from './catalog.service'
import { ProductQueryDto } from './catalog.dto'

const product = (provider: 'cloudinary' | 's3') => ({
  id: 'product-id',
  title: 'Test Shirt',
  slug: 'test-shirt',
  status: 'ACTIVE',
  priceMinor: 2500,
  currency: 'USD',
  compareAtMinor: null,
  stockOnHand: 1,
  hasVariants: false,
  categories: [],
  variants: [],
  media: [
    {
      mediaId: 'image-id',
      altText: 'Front',
      position: 0,
      media: {
        id: 'image-id',
        provider,
        status: 'ACTIVE',
        publicUrl:
          provider === 'cloudinary'
            ? 'https://res.cloudinary.com/sample/image/upload/v1720012345/shirt.png'
            : 'https://cdn.example.test/projects/kookaburra/products/image-id',
        width: 960,
        height: 720,
      },
    },
  ],
})

describe('03C-2C1 catalog queries retain image storage provider', () => {
  it('includes provider in public detail, Admin detail and paginated catalog queries', async () => {
    const findFirst = jest.fn().mockResolvedValue(product('cloudinary'))
    const findUnique = jest.fn().mockResolvedValue(product('cloudinary'))
    const findMany = jest.fn().mockResolvedValue([product('cloudinary')])
    const count = jest.fn().mockResolvedValue(1)
    const db = {
      client: {
        product: { findFirst, findUnique, findMany, count },
        $transaction: (promises: Array<Promise<unknown>>) =>
          Promise.all(promises),
      },
    } as unknown as DatabaseService
    const catalog = new CatalogService(db)
    const publicDetail = await catalog.getPublicProduct('test-shirt')
    const adminDetail = await catalog.getAdminProduct('product-id')
    const publicPage = await catalog.listProducts({} as ProductQueryDto, false)

    for (const call of [
      findFirst.mock.calls[0],
      findUnique.mock.calls[0],
      findMany.mock.calls[0],
    ]) {
      expect(call?.[0]?.include?.media?.include?.media?.select?.provider).toBe(
        true,
      )
    }
    for (const result of [publicDetail, adminDetail, publicPage.items[0]]) {
      expect(result?.gallery[0]?.srcSet).toContain('/f_auto,q_auto,w_960/')
      expect(result?.gallery[0]?.srcSet).not.toContain('w_1280/')
      expect(result?.gallery[0]?.sizes).toContain('100vw')
      expect(JSON.stringify(result)).not.toContain('providerAssetId')
    }
  })

  it('does not invent responsive URLs for S3 media', async () => {
    const findFirst = jest.fn().mockResolvedValue(product('s3'))
    const catalog = new CatalogService({
      client: { product: { findFirst } },
    } as unknown as DatabaseService)
    const result = await catalog.getPublicProduct('test-shirt')
    expect(result.gallery[0]?.src).toContain('cdn.example.test')
    expect(result.gallery[0]).not.toHaveProperty('srcSet')
  })
})
