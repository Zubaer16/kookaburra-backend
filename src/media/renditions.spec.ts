import {
  readyWidths,
  renditionKey,
  renditionUrl,
  widthsFor,
} from './renditions'
import { responsiveImage } from './responsive'

describe('03C-2C2 truthful derived image manifest', () => {
  const original =
    'https://cdn.example.test/projects/kookaburra/products/cd9de786-6d18-4d8e-b0a1-595b96d99a10'
  it('publishes only real, recorded variants and never upscales', () => {
    const data = [
      { width: 320, bytes: 1000 },
      { width: 480, bytes: 1800 },
    ]
    expect(readyWidths(data, 640)).toEqual([320, 480])
    const src = responsiveImage('s3', original, 640, data)
    expect(src.srcSet).toContain(`${original}-r/w_320.webp 320w`)
    expect(src.srcSet).toContain(`${original}-r/w_480.webp 480w`)
    expect(src.srcSet).not.toContain('w_640.webp')
    expect(
      responsiveImage(
        'disk',
        'https://media.example.test/v1/media/files/a',
        480,
        data,
      ).srcSet,
    ).toContain('?width=480 480w')
    expect(widthsFor(400)).toEqual([320])
  })
  it('never invents unrendered variants and validates the entire manifest', () => {
    expect(responsiveImage('s3', original, 1600, undefined)).toEqual({})
    expect(readyWidths([{ width: 960, bytes: 100 }], 640)).toEqual([])
    expect(
      readyWidths(
        [
          { width: 320, bytes: 100 },
          { width: 320, bytes: 20 },
        ],
        960,
      ),
    ).toEqual([])
    expect(readyWidths([{ width: 320, bytes: 0 }], 960)).toEqual([])
    expect(readyWidths([{ width: '320', bytes: 123 }], 960)).toEqual([])
    expect(readyWidths({ width: 320, bytes: 100 }, 960)).toEqual([])
    expect(() => renditionKey('safe', 777)).toThrow()
    expect(() => renditionUrl('disk', original, 777)).toThrow()
  })
})
