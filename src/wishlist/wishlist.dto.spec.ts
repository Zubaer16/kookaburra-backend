import { validateSync } from 'class-validator'
import { WishlistMergeDto } from './wishlist.dto'

function issues(value: unknown) {
  return validateSync(
    Object.assign(new WishlistMergeDto(), { productIds: value }),
  )
}

describe('05A-1 wishlist merge DTO boundaries', () => {
  const id = '11111111-1111-4111-8111-111111111111'
  it('accepts an empty no-op or canonical UUIDs', () => {
    expect(issues([])).toHaveLength(0)
    expect(issues([id])).toHaveLength(0)
  })
  it('rejects duplicate, invalid, non-array and oversized input', () => {
    expect(issues([id, id]).length).toBeGreaterThan(0)
    expect(issues(['p-demo']).length).toBeGreaterThan(0)
    expect(issues('not-array').length).toBeGreaterThan(0)
    expect(
      issues(Array.from({ length: 101 }, () => id)).length,
    ).toBeGreaterThan(0)
  })
})
