import 'reflect-metadata'
import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import { PutStoreBrandingDto } from './store-branding.dto'

const uuid = '43d638d0-504e-4023-a4f4-914e29b76a31'
const valid = { expectedRevision: 0, logoMediaId: uuid, faviconMediaId: null }
const errors = (input: Record<string, unknown>) =>
  validate(plainToInstance(PutStoreBrandingDto, input), {
    whitelist: true,
    forbidNonWhitelisted: true,
  })

describe('G3/05B-3 Store Branding media binding DTO', () => {
  it('accepts canonical UUID and explicit null detach', async () => {
    expect(await errors(valid)).toHaveLength(0)
    expect(
      await errors({
        expectedRevision: 3,
        logoMediaId: null,
        faviconMediaId: uuid,
      }),
    ).toHaveLength(0)
  })
  it.each([
    { expectedRevision: -1 },
    { expectedRevision: 0.25 },
    { expectedRevision: '0' },
    { logoMediaId: 'https://example.test/logo.png' },
    { logoMediaId: 'not-a-uuid' },
    { faviconMediaId: 'asset-key' },
    { logoMediaId: undefined },
    { faviconMediaId: undefined },
    { providerAssetId: 'private-asset' },
    { logoUrl: 'https://untrusted.example/logo.svg' },
    { role: 'OWNER' },
  ])('rejects untrusted or missing field %j', async (value) => {
    expect((await errors({ ...valid, ...value })).length).toBeGreaterThan(0)
  })
})
