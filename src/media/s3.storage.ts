import { createHash, createHmac } from 'node:crypto'
import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { Environment } from '../config/environment'
import type {
  MediaStorageProvider,
  UploadInstruction,
  VerifiedMedia,
} from './storage'

const MAX_BYTES = 10 * 1024 * 1024
const hash = (value: string | Buffer) =>
  createHash('sha256').update(value).digest('hex')
const hmac = (key: Buffer | string, text: string) =>
  createHmac('sha256', key).update(text).digest()
const encoded = (value: string) =>
  encodeURIComponent(value).replace(
    /[!'()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  )
const encodeKey = (key: string) => key.split('/').map(encoded).join('/')

// Check actual bytes, not client-supplied MIME/extension or S3 Content-Type alone.
// AVIF requires a full ISO-BMFF decoder; reject for this adapter until supported.
export function inspectImage(data: Buffer): {
  mimeType: string
  width: number
  height: number
} {
  let mimeType = ''
  let width = 0
  let height = 0
  if (
    data.length >= 24 &&
    data.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')) &&
    data.toString('ascii', 12, 16) === 'IHDR' &&
    data.readUInt32BE(8) === 13 &&
    data.length >= 45 &&
    data.readUInt32BE(data.length - 12) === 0 &&
    data.toString('ascii', data.length - 8, data.length - 4) === 'IEND'
  ) {
    mimeType = 'image/png'
    width = data.readUInt32BE(16)
    height = data.readUInt32BE(20)
  } else if (
    data.length >= 16 &&
    data.toString('ascii', 0, 4) === 'RIFF' &&
    data.toString('ascii', 8, 12) === 'WEBP' &&
    data.readUInt32LE(4) === data.length - 8
  ) {
    mimeType = 'image/webp'
    const chunk = data.toString('ascii', 12, 16)
    if (chunk === 'VP8X' && data.length >= 30) {
      width = 1 + data.readUIntLE(24, 3)
      height = 1 + data.readUIntLE(27, 3)
    } else if (chunk === 'VP8L' && data.length >= 25 && data[20] === 0x2f) {
      width = 1 + (data[21]! | ((data[22]! & 0x3f) << 8))
      height =
        1 + ((data[22]! >> 6) | (data[23]! << 2) | ((data[24]! & 0x0f) << 10))
    } else if (chunk === 'VP8 ' && data.length >= 30) {
      if (data[23] === 0x9d && data[24] === 0x01 && data[25] === 0x2a) {
        width = data.readUInt16LE(26) & 0x3fff
        height = data.readUInt16LE(28) & 0x3fff
      }
    }
  } else if (
    data.length >= 4 &&
    data[0] === 0xff &&
    data[1] === 0xd8 &&
    data[data.length - 2] === 0xff &&
    data[data.length - 1] === 0xd9
  ) {
    mimeType = 'image/jpeg'
    let offset = 2
    while (offset + 9 < data.length) {
      if (data[offset] !== 0xff) break
      let marker = data[offset + 1]!
      while (marker === 0xff && offset + 2 < data.length) {
        offset++
        marker = data[offset + 1]!
      }
      offset += 2
      if (marker === 0xd9 || marker === 0xda) break
      if (
        marker === 0xd8 ||
        marker === 0x01 ||
        (marker >= 0xd0 && marker <= 0xd7)
      )
        continue
      if (offset + 2 > data.length) break
      const len = data.readUInt16BE(offset)
      if (len < 2 || offset + len > data.length) break
      if (
        [
          0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd,
          0xce, 0xcf,
        ].includes(marker)
      ) {
        if (len >= 7) {
          height = data.readUInt16BE(offset + 3)
          width = data.readUInt16BE(offset + 5)
        }
        break
      }
      offset += len
    }
  }
  if (
    !mimeType ||
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width < 1 ||
    height < 1 ||
    width > 12000 ||
    height > 12000
  )
    throw new ConflictException(
      'Uploaded media failed file signature or dimensions validation',
    )
  return { mimeType, width, height }
}

@Injectable()
export class S3MediaProvider implements MediaStorageProvider {
  readonly key = 's3'
  constructor(private readonly config: ConfigService<Environment, true>) {}

  private values() {
    const endpoint = this.config.get('MEDIA_S3_ENDPOINT', { infer: true })
    const bucket = this.config.get('MEDIA_S3_BUCKET', { infer: true })
    const region = this.config.get('MEDIA_S3_REGION', { infer: true })
    const accessKey = this.config.get('MEDIA_S3_ACCESS_KEY_ID', { infer: true })
    const secretKey = this.config.get('MEDIA_S3_SECRET_ACCESS_KEY', {
      infer: true,
    })
    const publicBase = this.config.get('MEDIA_S3_PUBLIC_BASE_URL', {
      infer: true,
    })
    if (
      !endpoint ||
      !bucket ||
      !region ||
      !accessKey ||
      !secretKey ||
      !publicBase
    )
      throw new ServiceUnavailableException(
        'S3 media storage is not configured',
      )
    return { endpoint, bucket, region, accessKey, secretKey, publicBase }
  }

  private presign(
    objectKey: string,
    method: 'GET' | 'HEAD' | 'PUT' | 'DELETE',
    mimeType?: string,
  ) {
    const cfg = this.values()
    const endpoint = new URL(cfg.endpoint)
    const now = new Date()
    const date = now.toISOString().replace(/[:-]|\.\d{3}/g, '')
    const dateOnly = date.slice(0, 8)
    const scope = `${dateOnly}/${cfg.region}/s3/aws4_request`
    const canonicalUri = `/${encoded(cfg.bucket)}/${encodeKey(objectKey)}`
    const signedHeaders = mimeType ? 'content-type;host;if-none-match' : 'host'
    const params: Record<string, string> = {
      'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
      'X-Amz-Content-Sha256': 'UNSIGNED-PAYLOAD',
      'X-Amz-Credential': `${cfg.accessKey}/${scope}`,
      'X-Amz-Date': date,
      'X-Amz-Expires': method === 'PUT' ? '3600' : '60',
      'X-Amz-SignedHeaders': signedHeaders,
    }
    const query = Object.entries(params)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${encoded(k)}=${encoded(v)}`)
      .join('&')
    const headers = `${mimeType ? `content-type:${mimeType}\n` : ''}host:${endpoint.host}\n${mimeType ? 'if-none-match:*\n' : ''}`
    const canonical = [
      method,
      canonicalUri,
      query,
      headers,
      signedHeaders,
      'UNSIGNED-PAYLOAD',
    ].join('\n')
    const toSign = ['AWS4-HMAC-SHA256', date, scope, hash(canonical)].join('\n')
    const kDate = hmac(`AWS4${cfg.secretKey}`, dateOnly)
    const kRegion = hmac(kDate, cfg.region)
    const kService = hmac(kRegion, 's3')
    const key = hmac(kService, 'aws4_request')
    const signature = hmac(key, toSign).toString('hex')
    return `${cfg.endpoint}${canonicalUri}?${query}&X-Amz-Signature=${signature}`
  }

  signedUpload(objectKey: string, mimeType?: string): UploadInstruction {
    if (
      !mimeType ||
      !['image/jpeg', 'image/png', 'image/webp'].includes(mimeType)
    )
      throw new BadRequestException(
        'S3 adapter supports JPEG, PNG and WebP images',
      )
    return {
      uploadUrl: this.presign(objectKey, 'PUT', mimeType),
      method: 'PUT',
      headers: { 'Content-Type': mimeType, 'If-None-Match': '*' },
      fields: {},
    }
  }

  private async request(objectKey: string, method: 'HEAD' | 'GET' | 'DELETE') {
    try {
      return await fetch(this.presign(objectKey, method), {
        method,
        redirect: 'error',
        signal: AbortSignal.timeout(15000),
      })
    } catch {
      throw new BadGatewayException('Media provider unavailable')
    }
  }
  async verify(objectKey: string): Promise<VerifiedMedia> {
    const cfg = this.values()
    const head = await this.request(objectKey, 'HEAD')
    if (head.status === 404)
      throw new ConflictException('Upload not found at provider')
    if (!head.ok)
      throw new BadGatewayException('Media provider verification failed')
    const bytes = Number(head.headers.get('content-length'))
    const statedMime = head.headers.get('content-type')?.split(';')[0]?.trim()
    if (!Number.isSafeInteger(bytes) || bytes < 1 || bytes > MAX_BYTES)
      throw new ConflictException('Uploaded file size is not allowed')
    const response = await this.request(objectKey, 'GET')
    if (!response.ok)
      throw new BadGatewayException('Media provider verification failed')
    const chunks: Buffer[] = []
    let total = 0
    if (!response.body)
      throw new BadGatewayException('Media response was empty')
    const reader = response.body.getReader()
    try {
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        total += value.byteLength
        if (total > MAX_BYTES || total > bytes)
          throw new ConflictException('Media size changed during verification')
        chunks.push(Buffer.from(value))
      }
    } finally {
      reader.releaseLock()
    }
    if (total !== bytes)
      throw new ConflictException('Media size changed during verification')
    const details = inspectImage(Buffer.concat(chunks))
    if (details.mimeType !== statedMime)
      throw new ConflictException(
        'Uploaded MIME type does not match image bytes',
      )
    return {
      assetId: hash(objectKey),
      url: `${cfg.publicBase}/${encodeKey(objectKey)}`,
      bytes,
      ...details,
    }
  }
  /** Read only the DB-owned source image; cap download before decoding. */
  async readSource(objectKey: string): Promise<Buffer> {
    const response = await this.request(objectKey, 'GET')
    if (!response.ok || !response.body)
      throw new BadGatewayException('Media source unavailable')
    const chunks: Buffer[] = []
    let size = 0
    const reader = response.body.getReader()
    try {
      for (;;) {
        const { value, done } = await reader.read()
        if (done) break
        size += value.byteLength
        if (size > MAX_BYTES)
          throw new ConflictException('Media source exceeds size limit')
        chunks.push(Buffer.from(value))
      }
    } finally {
      reader.releaseLock()
    }
    return Buffer.concat(chunks)
  }

  /** Atomic create; a retry checks bytes rather than overwriting a published file. */
  async writeRendition(key: string, contents: Buffer): Promise<void> {
    const url = this.presign(key, 'PUT', 'image/webp')
    let response: Response
    try {
      response = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'image/webp', 'If-None-Match': '*' },
        body: new Uint8Array(contents),
        redirect: 'error',
        signal: AbortSignal.timeout(30000),
      })
    } catch {
      throw new BadGatewayException('Rendition storage unavailable')
    }
    if (response.status === 409 || response.status === 412) {
      const old = await this.readSource(key)
      if (!old.equals(contents))
        throw new ConflictException('Existing rendition differs')
      return
    }
    if (!response.ok) throw new BadGatewayException('Rendition storage failed')
  }

  async deleteRendition(key: string): Promise<void> {
    await this.delete(key)
  }

  async delete(objectKey: string) {
    const response = await this.request(objectKey, 'DELETE')
    if (response.status !== 404 && !response.ok)
      throw new BadGatewayException('Media deletion not confirmed')
  }
}
