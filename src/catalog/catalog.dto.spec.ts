import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import {
  CreateCategoryDto,
  CreateProductDto,
  CreateVariantDto,
  UpdateProductDto,
  UpdateVariantDto,
} from './catalog.dto'

const product = () => ({
  title: 'Sample Item',
  slug: 'sample-item',
  sku: 'SAMPLE-001',
  priceMinor: 1250,
  categoryIds: ['4c88c7ed-32d3-4a3c-9e37-582dc0cc4dd3'],
})

describe('Catalog DTO validation', () => {
  it('rejects invalid category slug', async () => {
    const value = plainToInstance(CreateCategoryDto, {
      name: 'Shoes',
      slug: '../unsafe',
    })
    const errors = await validate(value)
    expect(errors.some((error) => error.property === 'slug')).toBe(true)
  })

  it('rejects unsafe product price and duplicate category links', async () => {
    const value = plainToInstance(CreateProductDto, {
      ...product(),
      priceMinor: -1,
      categoryIds: [product().categoryIds[0], product().categoryIds[0]],
    })
    const errors = await validate(value)
    expect(errors.some((error) => error.property === 'priceMinor')).toBe(true)
    expect(errors.some((error) => error.property === 'categoryIds')).toBe(true)
  })

  it('rejects direct stock edits and variant replacement on product update', async () => {
    const value = plainToInstance(UpdateProductDto, {
      stockOnHand: 200,
      variants: [],
    })
    const errors = await validate(value, {
      whitelist: true,
      forbidNonWhitelisted: true,
    })
    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining(['stockOnHand', 'variants']),
    )
  })

  it('rejects direct stock edits on variant update', async () => {
    const value = plainToInstance(UpdateVariantDto, {
      stockOnHand: 200,
    })
    const errors = await validate(value, {
      whitelist: true,
      forbidNonWhitelisted: true,
    })
    expect(errors.map((error) => error.property)).toContain('stockOnHand')
  })

  it('rejects invalid nested variant stock', async () => {
    const value = plainToInstance(CreateVariantDto, {
      sku: 'SHOE-01-RED',
      options: { size: 'M' },
      stockOnHand: -2,
    })
    const errors = await validate(value)
    expect(errors.some((error) => error.property === 'stockOnHand')).toBe(true)
  })
})
