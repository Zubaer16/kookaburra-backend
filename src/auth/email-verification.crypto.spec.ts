import { randomBytes } from 'node:crypto'
import {
  encryptEmailActionToken,
  decryptEmailActionToken,
} from './email-verification.crypto'

describe('G2-5 encrypted outbox handoff', () => {
  const key = randomBytes(32).toString('hex')
  it('roundtrips only with correct key and binding', () => {
    const data = encryptEmailActionToken(
      key,
      'safe-link-secret',
      'user:request',
    )
    expect(JSON.stringify(data)).not.toContain('safe-link-secret')
    expect(decryptEmailActionToken(key, data, 'user:request')).toBe(
      'safe-link-secret',
    )
    expect(() => decryptEmailActionToken(key, data, 'wrong')).toThrow()
    expect(() =>
      decryptEmailActionToken(
        randomBytes(32).toString('hex'),
        data,
        'user:request',
      ),
    ).toThrow()
  })
  it('refuses malformed key', () => {
    expect(() =>
      encryptEmailActionToken('invalid', 'token', 'binding'),
    ).toThrow()
  })
})
