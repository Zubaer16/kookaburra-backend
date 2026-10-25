import { plainToInstance } from 'class-transformer'
import { validateSync } from 'class-validator'
import {
  AdjustInventoryDto,
  AdjustmentReason,
  InventoryQueryDto,
  SetLowStockThresholdDto,
} from './inventory.dto'

const valid = {
  requestId: 'a68b5271-aa77-4996-b2c0-3bd9225e7e2f',
  delta: 10,
  reason: AdjustmentReason.RECEIPT,
}
const invalid = (value: object) =>
  validateSync(plainToInstance(AdjustInventoryDto, value)).length > 0

describe('Phase 03B inventory DTO boundaries', () => {
  it('requires UUID idempotency keys and signed nonzero integer delta', () => {
    expect(invalid(valid)).toBe(false)
    for (const item of [
      { ...valid, requestId: 'not-uuid' },
      { ...valid, delta: 0 },
      { ...valid, delta: -2.5 },
      { ...valid, delta: 2147483648 },
      { ...valid, delta: -2147483648 },
      { ...valid, reason: 'OPENING' },
      { ...valid, note: 'x'.repeat(501) },
      { delta: 1, reason: AdjustmentReason.RECEIPT },
    ])
      expect(invalid(item)).toBe(true)
  })
  it('accepts zero threshold and rejects negatives, fractions and int overflow', () => {
    expect(
      validateSync(
        plainToInstance(SetLowStockThresholdDto, { lowStockThreshold: 0 }),
      ),
    ).toHaveLength(0)
    for (const value of [-1, 2.5, 2147483648, 'five']) {
      expect(
        validateSync(
          plainToInstance(SetLowStockThresholdDto, {
            lowStockThreshold: value,
          }),
        ).length,
      ).toBeGreaterThan(0)
    }
  })
  it('transforms pagination and rejects malformed low-stock boolean', () => {
    expect(
      validateSync(
        plainToInstance(InventoryQueryDto, {
          page: '1',
          limit: '20',
          lowStock: 'true',
        }),
      ),
    ).toHaveLength(0)
    expect(
      validateSync(
        plainToInstance(InventoryQueryDto, { page: '0', lowStock: 'maybe' }),
      ).length,
    ).toBeGreaterThan(0)
  })
})
