import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

/** G7-only delivery adapter will decrypt; never expose plaintext via HTTP/logs. */
export type EncryptedActionToken = {
  algorithm: 'aes-256-gcm'
  iv: string
  ciphertext: string
  tag: string
}

export function encryptEmailActionToken(
  keyHex: string,
  token: string,
  binding: string,
): EncryptedActionToken {
  if (!/^[a-fA-F0-9]{64}$/.test(keyHex))
    throw new Error('Action token encryption key not configured')
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', Buffer.from(keyHex, 'hex'), iv)
  cipher.setAAD(Buffer.from(binding, 'utf8'))
  const encrypted = Buffer.concat([
    cipher.update(token, 'utf8'),
    cipher.final(),
  ])
  return {
    algorithm: 'aes-256-gcm',
    iv: iv.toString('base64url'),
    ciphertext: encrypted.toString('base64url'),
    tag: cipher.getAuthTag().toString('base64url'),
  }
}

export function decryptEmailActionToken(
  keyHex: string,
  payload: EncryptedActionToken,
  binding: string,
): string {
  if (!/^[a-fA-F0-9]{64}$/.test(keyHex) || payload.algorithm !== 'aes-256-gcm')
    throw new Error('Action token encryption key not configured')
  const decipher = createDecipheriv(
    'aes-256-gcm',
    Buffer.from(keyHex, 'hex'),
    Buffer.from(payload.iv, 'base64url'),
  )
  decipher.setAAD(Buffer.from(binding, 'utf8'))
  decipher.setAuthTag(Buffer.from(payload.tag, 'base64url'))
  return Buffer.concat([
    decipher.update(Buffer.from(payload.ciphertext, 'base64url')),
    decipher.final(),
  ]).toString('utf8')
}
