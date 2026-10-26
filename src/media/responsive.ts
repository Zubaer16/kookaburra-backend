import { readyWidths, renditionUrl } from './renditions'
/** Only Cloudinary can derive actual resized URLs without a rendition worker.
 * S3/R2 and disk return the verified original; never advertise fake srcSet URLs.
 */
const WIDTHS = [320, 480, 640, 960, 1280, 1600] as const

export type ResponsiveImage = { srcSet?: string; sizes?: string }

export function responsiveImage(
  provider: string,
  publicUrl: string | null,
  originalWidth: number,
  manifest?: unknown,
): ResponsiveImage {
  // S3 and disk image URLs become responsive only when every URL points to a
  // real, verified generated file recorded in the DB, not a hypothetical resize.
  if ((provider === 's3' || provider === 'disk') && publicUrl) {
    const widths = readyWidths(manifest, originalWidth)
    if (!widths.length) return {}
    return {
      srcSet: widths
        .map((width) => `${renditionUrl(provider, publicUrl, width)} ${width}w`)
        .join(', '),
      sizes: '(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw',
    }
  }
  if (provider !== 'cloudinary' || !publicUrl) return {}
  if (!Number.isSafeInteger(originalWidth) || originalWidth < 320) return {}
  let url: URL
  try {
    url = new URL(publicUrl)
  } catch {
    return {}
  }
  if (
    url.protocol !== 'https:' ||
    url.hostname !== 'res.cloudinary.com' ||
    url.port ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !/^\/[a-zA-Z0-9_-]{1,80}\/image\/upload\//.test(url.pathname)
  )
    return {}
  const token = '/image/upload/'
  const at = url.pathname.indexOf(token)
  const tail = url.pathname.slice(at + token.length)
  // Only transform versioned, verified upload IDs. Avoid transformation ambiguity.
  if (!/^v\d+\/[a-zA-Z0-9_./%-]+$/.test(tail) || tail.includes('..')) return {}
  const widths = WIDTHS.filter((width) => width <= originalWidth)
  if (!widths.length) return {}
  const before = `${url.origin}${url.pathname.slice(0, at)}${token}`
  return {
    srcSet: widths
      .map((width) => `${before}f_auto,q_auto,w_${width}/${tail} ${width}w`)
      .join(', '),
    sizes: '(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw',
  }
}
