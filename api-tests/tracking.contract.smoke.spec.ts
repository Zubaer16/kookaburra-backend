import { expect, test } from '@playwright/test'

test('04D-2B-2 Swagger contract: protected PII-free tracking read projection', async ({ request }) => {
  const res = await request.get('/docs-json')
  expect(res.status()).toBe(200)
  const doc = await res.json()
  for (const [path, tag] of [
    ['/v1/orders/{id}/tracking', 'Tracking / Customer'],
    ['/v1/admin/orders/{id}/tracking', 'Tracking / Admin'],
  ]) {
    const pathDoc = doc.paths[path]
    expect(pathDoc, path).toBeDefined()
    expect(Object.keys(pathDoc).filter((x) => ['get', 'post', 'patch', 'put', 'delete'].includes(x))).toEqual(['get'])
    expect(pathDoc.get.tags).toContain(tag)
    expect(pathDoc.get.security).toEqual([{ 'access-token': [] }])
    const response = pathDoc.get.responses['200'].content['application/json'].schema
    expect(response.$ref).toContain('OrderTrackingResponseDto')
  }
  const schemas = doc.components.schemas
  expect(Object.keys(schemas.OrderTrackingResponseDto.properties).sort()).toEqual([
    'events', 'orderId', 'orderStatus', 'originalShipment', 'replacements', 'returns',
  ])
  expect(Object.keys(schemas.TrackingShipmentDto.properties).sort()).toEqual([
    'carrier', 'deliveredAt', 'id', 'shippedAt', 'status', 'trackingNumber',
  ])
  expect(Object.keys(schemas.TrackingReplacementDto.properties).sort()).toEqual([
    'carrier', 'deliveredAt', 'id', 'quantity', 'returnId', 'shippedAt', 'status', 'trackingNumber',
  ])
  expect(Object.keys(schemas.TrackingEventDto.properties).sort()).toEqual([
    'id', 'occurredAt', 'referenceId', 'status', 'type',
  ])
  for (const dto of ['OrderTrackingResponseDto', 'TrackingShipmentDto', 'TrackingReturnDto', 'TrackingReplacementDto', 'TrackingEventDto']) {
    for (const secret of ['customerId', 'shippingAddress', 'totalMinor', 'email', 'password', 'paymentTransaction', 'actorId', 'requestHash', 'refundAmount']) {
      expect(schemas[dto].properties).not.toHaveProperty(secret)
    }
  }
})
