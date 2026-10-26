import { createHash } from 'node:crypto'
import {
  Injectable,
  ServiceUnavailableException,
  BadGatewayException,
  ConflictException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Environment } from '../config/environment'

export type VerifiedMedia = {
  assetId: string
  url: string
  bytes: number
  width: number
  height: number
  mimeType: string
}
export type UploadInstruction = {
  uploadUrl: string
  fields: Record<string, string | number | boolean>
}
export interface MediaStorageProvider {
  readonly key: string
  signedUpload(objectKey: string): UploadInstruction
  verify(objectKey: string): Promise<VerifiedMedia>
  delete(objectKey: string): Promise<void>
}

/** Cloudinary direct signed upload + read-back from authenticated Admin API.
 * No client supplied URL, public ID or provider ID is ever trusted.
 * S3/R2/VPS provider implementations can satisfy this same interface later.
 */
@Injectable()
export class CloudinaryMediaProvider implements MediaStorageProvider {
  readonly key = 'cloudinary'
  private readonly cloud: string
  private readonly apiKey: string
  private readonly apiSecret: string
  constructor(config: ConfigService<Environment, true>) {
    this.cloud = config.get('MEDIA_CLOUD_NAME', { infer: true })
    this.apiKey = config.get('MEDIA_API_KEY', { infer: true })
    this.apiSecret = config.get('MEDIA_API_SECRET', { infer: true })
  }
  private configured() {
    if (!this.cloud || !this.apiKey || !this.apiSecret)
      throw new ServiceUnavailableException('Media storage is not configured')
  }
  private signature(fields: Record<string, string | number | boolean>) {
    const payload = Object.entries(fields)
      .filter(
        ([k, v]) =>
          k !== 'api_key' && k !== 'file' && k !== 'signature' && v !== '',
      )
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join('&')
    return createHash('sha1')
      .update(payload + this.apiSecret)
      .digest('hex')
  }
  signedUpload(objectKey: string): UploadInstruction {
    this.configured()
    const values = {
      public_id: objectKey,
      timestamp: Math.floor(Date.now() / 1000),
      overwrite: false,
      unique_filename: false,
    }
    return {
      uploadUrl: `https://api.cloudinary.com/v1_1/${this.cloud}/image/upload`,
      fields: {
        ...values,
        api_key: this.apiKey,
        signature: this.signature(values),
      },
    }
  }
  private async readResponse(response: Response) {
    if (response.status === 404) return null
    if (!response.ok)
      throw new BadGatewayException('Media provider request failed')
    return (await response.json()) as Record<string, unknown>
  }
  async verify(objectKey: string): Promise<VerifiedMedia> {
    this.configured()
    let response: Response
    try {
      response = await fetch(
        `https://api.cloudinary.com/v1_1/${this.cloud}/resources/image/upload/${encodeURIComponent(objectKey)}`,
        {
          headers: {
            Authorization: `Basic ${Buffer.from(`${this.apiKey}:${this.apiSecret}`).toString('base64')}`,
          },
          signal: AbortSignal.timeout(10000),
        },
      )
    } catch {
      throw new BadGatewayException('Media provider unavailable')
    }
    const info = await this.readResponse(response)
    if (!info) throw new ConflictException('Upload not found at provider')
    const format = String(info.format ?? '').toLowerCase()
    const formats: Record<string, string> = {
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      webp: 'image/webp',
      avif: 'image/avif',
    }
    const mimeType = formats[format]
    const bytes = Number(info.bytes),
      width = Number(info.width),
      height = Number(info.height)
    const url = String(info.secure_url ?? '')
    const assetId = String(info.asset_id ?? '')
    if (
      info.public_id !== objectKey ||
      info.resource_type !== 'image' ||
      !mimeType ||
      !Number.isSafeInteger(bytes) ||
      bytes <= 0 ||
      bytes > 10485760 ||
      !Number.isSafeInteger(width) ||
      width < 1 ||
      width > 12000 ||
      !Number.isSafeInteger(height) ||
      height < 1 ||
      height > 12000 ||
      !/^[0-9a-zA-Z_-]{12,200}$/.test(assetId) ||
      !url.startsWith(`https://res.cloudinary.com/${this.cloud}/image/upload/`)
    )
      throw new ConflictException('Uploaded media failed provider verification')
    return { assetId, url, bytes, width, height, mimeType }
  }
  async delete(objectKey: string): Promise<void> {
    this.configured()
    const fields = {
      public_id: objectKey,
      timestamp: Math.floor(Date.now() / 1000),
      invalidate: true,
    }
    let response: Response
    try {
      response = await fetch(
        `https://api.cloudinary.com/v1_1/${this.cloud}/image/destroy`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams(
            Object.entries({
              ...fields,
              api_key: this.apiKey,
              signature: this.signature(fields),
            }).map(([k, v]) => [k, String(v)] as [string, string]),
          ).toString(),
          signal: AbortSignal.timeout(10000),
        },
      )
    } catch {
      throw new BadGatewayException('Media provider unavailable')
    }
    const info = await this.readResponse(response)
    if (!info || (info.result !== 'ok' && info.result !== 'not found'))
      throw new BadGatewayException('Media deletion not confirmed')
  }
}
