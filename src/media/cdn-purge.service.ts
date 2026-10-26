import {
  BadGatewayException,
  ConflictException,
  Injectable,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { Environment } from '../config/environment'
import { renditionUrl } from './renditions'

/** Optional Cloudflare zone purge. Cloudinary already requests invalidation at destroy.
 * No purge from arbitrary caller-provided URLs; only DB-verified provider URLs in our namespace.
 * A failed purge raises an error so the durable media deletion job is retried.
 */
@Injectable()
export class MediaCdnPurgeService {
  constructor(private readonly config: ConfigService<Environment, true>) {}

  async purge(
    provider: string,
    objectKey: string,
    publicUrl: string | null,
    widths: number[] = [],
  ) {
    if (provider === 'cloudinary' || !publicUrl) return
    if (provider !== 's3' && provider !== 'disk')
      throw new ConflictException('Unknown CDN media provider')
    const zoneId = this.config.get('MEDIA_CDN_CF_ZONE_ID', { infer: true })
    const token = this.config.get('MEDIA_CDN_CF_API_TOKEN', { infer: true })
    if (!zoneId && !token) return // No external CDN configured; respect its own cache TTL.
    if (!zoneId || !token)
      throw new BadGatewayException('CDN invalidation is not configured')
    const namespace = this.config.get('MEDIA_NAMESPACE', { infer: true })
    if (!objectKey.startsWith(`${namespace}/`))
      throw new ConflictException('CDN asset namespace mismatch')
    const expected =
      provider === 's3'
        ? `${this.config.get('MEDIA_S3_PUBLIC_BASE_URL', { infer: true })}/${objectKey.split('/').map(encodeURIComponent).join('/')}`
        : `${this.config.get('MEDIA_DISK_PUBLIC_BASE_URL', { infer: true })}/v1/media/files/${objectKey.slice(namespace.length + 1)}`
    if (publicUrl !== expected)
      throw new ConflictException(
        'CDN deletion URL differs from verified provider URL',
      )
    const files = [
      expected,
      ...widths.map((w) => renditionUrl(provider, expected, w)),
    ]
    try {
      const response = await fetch(
        `https://api.cloudflare.com/client/v4/zones/${zoneId}/purge_cache`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ files }),
          signal: AbortSignal.timeout(10000),
        },
      )
      if (!response.ok) throw new Error('CDN returned non-success status')
      const result = (await response.json()) as { success?: boolean }
      if (result.success !== true) throw new Error('CDN did not confirm purge')
    } catch {
      // Avoid exposing Cloudflare credentials, provider error body or URLs in logs.
      throw new BadGatewayException('Media CDN invalidation failed')
    }
  }
}
