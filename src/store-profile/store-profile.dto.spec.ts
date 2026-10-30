import 'reflect-metadata'
import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import { PutStoreProfileDto } from './store-profile.dto'

const valid = {
  storeName: 'Demo Store',
  supportEmail: 'hello@example.com',
  websiteUrl: 'https://example.com',
  timezone: 'UTC',
  supportNotice: '',
}
async function errors(data: Record<string, unknown>) {
  return validate(plainToInstance(PutStoreProfileDto, data), {
    whitelist: true,
    forbidNonWhitelisted: true,
  })
}
describe('G3/05B-1 profile DTO boundaries', () => {
  it('accepts the five safe Admin preview fields', async () => {
    expect(await errors(valid)).toHaveLength(0)
    expect(await errors({ ...valid, websiteUrl: '' })).toHaveLength(0)
  })
  it.each([
    { storeName: ' ' },
    { storeName: 'A' },
    { supportEmail: 'not-an-email' },
    { supportEmail: 'a'.repeat(125) + '@example.com' },
    { websiteUrl: 'http://example.com' },
    { websiteUrl: 'javascript:alert(1)' },
    { timezone: 'Invalid/Zone' },
    { supportNotice: '<script>alert(1)</script>' },
    { supportNotice: 'a'.repeat(181) },
    { orderPrefix: 'KB' },
  ])('rejects invalid/mass-assigned payload: %j', async (change) => {
    expect((await errors({ ...valid, ...change })).length).toBeGreaterThan(0)
  })
})
