import { expect, test } from '@playwright/test'
import { CatalogTestFixture, bearer } from './catalog-test-support'

const content = {
  seoTitle: ' QA Demo Shop ',
  seoDescription: 'A store that ships worldwide.',
  footerText: 'Independent shop',
  privacyPolicy: 'Private details stay private.\nRead more.',
  termsOfService: 'Store terms.',
  returnPolicy: 'Return terms.',
}

test('05B-2 PostgreSQL: revision-safe OWNER publishing and public projection', async ({
  request,
}) => {
  const f = new CatalogTestFixture(request)
  const previous = await f.db.storeContent.findUnique({
    where: { key: 'primary' },
  })
  try {
    const owner = await f.account('OWNER')
    const before = await request.get('/v1/admin/store/content', {
      headers: bearer(owner.token),
    })
    expect(before.status()).toBe(200)
    const revision = (await before.json()).revision as number
    const saved = await request.put('/v1/admin/store/content', {
      headers: bearer(owner.token),
      data: { ...content, expectedRevision: revision },
    })
    expect(saved.status()).toBe(200)
    expect(await saved.json()).toMatchObject({
      configured: true,
      revision: revision + 1,
      seoTitle: 'QA Demo Shop',
    })
    const publicRes = await request.get('/v1/store/content')
    expect(publicRes.status()).toBe(200)
    const projection = await publicRes.json()
    expect(projection).toMatchObject({
      configured: true,
      seoTitle: 'QA Demo Shop',
      returnPolicy: content.returnPolicy,
    })
    expect(projection).not.toHaveProperty('revision')
    expect(projection).not.toHaveProperty('updatedAt')
    expect(projection).not.toHaveProperty('actorId')
    const stale = await request.put('/v1/admin/store/content', {
      headers: bearer(owner.token),
      data: {
        ...content,
        seoTitle: 'Stale update',
        expectedRevision: revision,
      },
    })
    expect(stale.status()).toBe(409)
    expect(
      (await f.db.storeContent.findUniqueOrThrow({ where: { key: 'primary' } }))
        .seoTitle,
    ).toBe('QA Demo Shop')
    expect(
      await f.db.auditEvent.count({
        where: { actorId: owner.id, action: 'store.content.updated' },
      }),
    ).toBe(1)
    const next = await request.put('/v1/admin/store/content', {
      headers: bearer(owner.token),
      data: {
        ...content,
        footerText: 'Updated footer',
        expectedRevision: revision + 1,
      },
    })
    expect(next.status()).toBe(200)
    expect((await next.json()).revision).toBe(revision + 2)
  } finally {
    if (previous) {
      await f.db.storeContent.upsert({
        where: { key: 'primary' },
        create: { ...previous },
        update: { ...previous },
      })
    } else {
      await f.db.storeContent.deleteMany({ where: { key: 'primary' } })
    }
    await f.close()
  }
})
