import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import { SetCartItemDto } from './cart.dto'

const validId = '11111111-1111-4111-8111-111111111111'
const check = async (value: Record<string, unknown>) => {
  const instance = plainToInstance(SetCartItemDto, value)
  return validate(instance)
}

describe('04A cart input boundaries', () => {
  it('accepts a canonical product ID, optional variant and 1..99', async () => {
    expect(await check({ productId: validId, quantity: 1 })).toHaveLength(0)
    expect(
      await check({ productId: validId, variantId: validId, quantity: 99 }),
    ).toHaveLength(0)
    expect(
      await check({ productId: validId, variantId: null, quantity: 1 }),
    ).toHaveLength(0)
  })
  it('rejects negative, overcap, fractional, string and malformed IDs', async () => {
    for (const item of [
      { productId: validId, quantity: 0 },
      { productId: validId, quantity: 100 },
      { productId: validId, quantity: 1.5 },
      { productId: validId, quantity: '2' },
      { productId: 'wrong', quantity: 1 },
      { productId: validId, variantId: 'wrong', quantity: 1 },
    ])
      expect((await check(item)).length).toBeGreaterThan(0)
  })
})
