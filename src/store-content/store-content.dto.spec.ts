import 'reflect-metadata'
import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import { PutStoreContentDto } from './store-content.dto'

const good = {
  expectedRevision: 0,
  seoTitle: 'A Store',
  seoDescription: 'Buy responsibly.',
  footerText: 'Independent brand.',
  privacyPolicy: 'Privacy details\nContact support.',
  termsOfService: 'Terms apply.',
  returnPolicy: 'Returns accepted as described.',
}
const errs = (payload: Record<string, unknown>) =>
  validate(plainToInstance(PutStoreContentDto, payload), {
    whitelist: true,
    forbidNonWhitelisted: true,
  })

describe('G3/05B-2 store public content DTO', () => {
  it('accepts plain-text line breaks and an empty policy document', async () => {
    expect(await errs(good)).toHaveLength(0)
    expect(await errs({ ...good, termsOfService: '' })).toHaveLength(0)
  })
  it.each([
    { expectedRevision: -1 },
    { expectedRevision: 1.5 },
    { expectedRevision: '0' },
    { seoTitle: 'A'.repeat(71) },
    { seoDescription: 'A'.repeat(181) },
    { footerText: '<img src=x>' },
    { privacyPolicy: '<script>bad</script>' },
    { termsOfService: 'A'.repeat(10001) },
    { returnPolicy: 'control\u0000' },
    { role: 'OWNER' },
    { mediaId: 'any' },
  ])('rejects invalid or unauthorized field %j', async (diff) => {
    expect((await errs({ ...good, ...diff })).length).toBeGreaterThan(0)
  })
})
