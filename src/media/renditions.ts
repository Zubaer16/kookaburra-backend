/** Fixed non-upscaled variants; generated only by a durable worker. */
export const RENDITION_WIDTHS = [320, 480, 640, 960, 1280, 1600] as const
export const widthsFor = (originalWidth: number): number[] =>
  RENDITION_WIDTHS.filter((width) => width <= originalWidth)

export type RenditionEntry = { width: number; bytes: number }
/** Reject malformed or client-forged manifests (the DB is not a URL authority). */
export function readyWidths(value: unknown, originalWidth: number): number[] {
  if (!Array.isArray(value) || value.length > RENDITION_WIDTHS.length) return []
  const allowed = new Set(widthsFor(originalWidth))
  const found = new Set<number>()
  for (const entry of value) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return []
    const item = entry as Partial<RenditionEntry>
    if (
      !Number.isInteger(item.width) ||
      !Number.isSafeInteger(item.bytes) ||
      (item.bytes ?? 0) < 1 ||
      !allowed.has(item.width!) ||
      found.has(item.width!)
    )
      return []
    found.add(item.width!)
  }
  return [...found].sort((a, b) => a - b)
}

/** Remote key is a strict suffix of the DB-owned original key, never user input. */
export function renditionKey(originalKey: string, width: number): string {
  if (!RENDITION_WIDTHS.some((w) => w === width))
    throw new Error('Invalid rendition width')
  return `${originalKey}-r/w_${width}.webp`
}
export function renditionUrl(
  provider: 's3' | 'disk',
  originalUrl: string,
  width: number,
) {
  if (!RENDITION_WIDTHS.some((w) => w === width))
    throw new Error('Invalid rendition width')
  return provider === 's3'
    ? `${originalUrl}-r/w_${width}.webp`
    : `${originalUrl}?width=${width}`
}
