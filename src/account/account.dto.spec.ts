import { validateSync } from 'class-validator'
import {
  CustomerAddressInputDto,
  UpdateCustomerAddressDto,
  UpdateCustomerProfileDto,
} from './account.dto'

const valid = {
  recipientName: 'Sample Person',
  phone: '+12025550123',
  addressLine1: '123 Example Street',
  city: 'New York',
  countryCode: 'US',
}

function errors<T extends object>(
  cls: new () => T,
  data: Record<string, unknown>,
) {
  return validateSync(Object.assign(new cls(), data))
}

describe('05A-2 account DTO boundaries', () => {
  it('accepts valid profile and optional address details', () => {
    expect(errors(UpdateCustomerProfileDto, { displayName: 'A' })).toHaveLength(
      0,
    )
    expect(errors(CustomerAddressInputDto, valid)).toHaveLength(0)
    expect(
      errors(CustomerAddressInputDto, {
        ...valid,
        label: 'Office',
        isDefault: true,
        postalCode: '',
      }),
    ).toHaveLength(0)
    expect(errors(UpdateCustomerAddressDto, { isDefault: true })).toHaveLength(
      0,
    )
  })
  it('rejects invalid profile names, phones, country case and bulk role fields', () => {
    expect(
      errors(UpdateCustomerProfileDto, { displayName: '    ' }).length,
    ).toBeGreaterThan(0)
    expect(
      errors(UpdateCustomerProfileDto, { displayName: 'X'.repeat(121) }).length,
    ).toBeGreaterThan(0)
    expect(
      errors(CustomerAddressInputDto, { ...valid, phone: 'not-phone' }).length,
    ).toBeGreaterThan(0)
    expect(
      errors(CustomerAddressInputDto, { ...valid, countryCode: 'us' }).length,
    ).toBeGreaterThan(0)
    expect(
      errors(CustomerAddressInputDto, { ...valid, city: ' ' }).length,
    ).toBeGreaterThan(0)
    expect(
      errors(UpdateCustomerAddressDto, { countryCode: 'USA' }).length,
    ).toBeGreaterThan(0)
  })
})
