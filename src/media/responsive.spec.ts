import { responsiveImage } from './responsive'

describe('03C-2C provider-correct responsive URLs', () => {
  const cloud =
    'https://res.cloudinary.com/shop1/image/upload/v1720012345/projects/store/products/abc.jpg'
  it('provides real Cloudinary transformations only up to the original width', () => {
    const result = responsiveImage('cloudinary', cloud, 1000)
    expect(result.srcSet).toContain('/f_auto,q_auto,w_320/v1720012345/')
    expect(result.srcSet).toContain('/f_auto,q_auto,w_960/v1720012345/')
    expect(result.srcSet).not.toContain('w_1280/')
    expect(result.sizes).toContain('100vw')
  })
  it('does not invent resized S3/R2 or VPS URL variants', () => {
    expect(responsiveImage('s3', cloud, 1600)).toEqual({})
    expect(responsiveImage('disk', cloud, 1600)).toEqual({})
  })
  it('rejects untrusted hosts, arbitrary URL transformations, tiny images and queries', () => {
    expect(
      responsiveImage(
        'cloudinary',
        'https://evil.example/image/upload/v123/a.png',
        800,
      ),
    ).toEqual({})
    expect(
      responsiveImage(
        'cloudinary',
        'https://res.cloudinary.com/shop1/image/upload/t_unsafe/a.png',
        800,
      ),
    ).toEqual({})
    expect(
      responsiveImage('cloudinary', `${cloud}?token=private`, 800),
    ).toEqual({})
    expect(responsiveImage('cloudinary', cloud, 200)).toEqual({})
    expect(responsiveImage('cloudinary', null, 800)).toEqual({})
  })
})
