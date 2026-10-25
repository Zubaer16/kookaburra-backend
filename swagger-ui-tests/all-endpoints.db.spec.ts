import { expect, test } from '@playwright/test'
import { URL } from 'node:url'
import { randomBytes, randomUUID } from 'node:crypto'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client'
import {
  authorizeInSwagger,
  openSwagger,
  swaggerExecute,
} from './swagger-helper'

// STRICT GUARD: Never run this test on development, Neon, or production data.
function testPrisma() {
  if (process.env.API_TEST_MODE !== 'db' || !process.env.DATABASE_URL) {
    throw new Error('Visual auth tests require guarded local test DB mode')
  }
  const url = new URL(process.env.DATABASE_URL)
  if (
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname.toLowerCase()) ||
    decodeURIComponent(url.pathname.slice(1)) !== 'kookaburra_api_test'
  ) {
    throw new Error('Refusing unsafe database; only local kookaburra_api_test')
  }
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  })
}

function temporaryCredentials() {
  return {
    email: `visual-${randomUUID()}@example.test`,
    password: `Visual-${randomBytes(18).toString('hex')}!`,
  }
}

// Exercises all 8 Phase 02 auth/health routes including negative cases via Swagger UI Execute.
// The 15 Phase 03A Catalog routes live in catalog.db.spec.ts. Only randomly
// created test accounts are used and deleted afterward.
test('Watch Swagger Execute the 8 Phase 02 API endpoints', async ({ page }) => {
  const prisma = testPrisma()
  let customerId: string | undefined
  let staffId: string | undefined
  const customer = temporaryCredentials()
  const staff = temporaryCredentials()
  try {
    await openSwagger(page)
    await test.step('GET /v1/health -> 200', async () => {
      await swaggerExecute(page, 'GET', '/v1/health', 200)
    })
    await test.step('Bad customer registration rejected -> 400', async () => {
      await swaggerExecute(page, 'POST', '/v1/auth/register', 400, {
        email: 'not-an-email',
        password: 'short',
      })
    })
    await test.step('POST /v1/auth/register -> 201', async () => {
      const response = await swaggerExecute(
        page,
        'POST',
        '/v1/auth/register',
        201,
        customer,
      )
      const data = await response.json()
      customerId = data.user.id as string
      expect(data.user.email).toBe(customer.email)
    })
    await test.step('Duplicate registration rejected -> 409; row not duplicated', async () => {
      const prior = await prisma.user.count({
        where: { email: customer.email },
      })
      expect(prior).toBe(1)
      await swaggerExecute(page, 'POST', '/v1/auth/register', 409, customer)
      expect(
        await prisma.user.count({ where: { email: customer.email } }),
      ).toBe(1)
    })
    await test.step('Incorrect password rejected -> 401', async () => {
      const before = await prisma.auditEvent.count({
        where: { actorId: customerId, action: 'customer.login' },
      })
      await swaggerExecute(page, 'POST', '/v1/auth/login', 401, {
        email: customer.email,
        password: `Wrong-${randomBytes(18).toString('hex')}!`,
      })
      expect(
        await prisma.auditEvent.count({
          where: { actorId: customerId, action: 'customer.login' },
        }),
      ).toBe(before)
    })
    let accessToken = ''
    let refreshToken = ''
    await test.step('POST /v1/auth/login -> 200', async () => {
      const response = await swaggerExecute(
        page,
        'POST',
        '/v1/auth/login',
        200,
        customer,
      )
      const data = await response.json()
      accessToken = data.accessToken as string
      refreshToken = data.refreshToken as string
      expect(accessToken).toEqual(expect.any(String))
    })
    await test.step('GET /v1/auth/me without token -> 401', async () => {
      await swaggerExecute(page, 'GET', '/v1/auth/me', 401)
    })
    await test.step('Swagger Authorize, GET /v1/auth/me -> 200', async () => {
      await authorizeInSwagger(page, accessToken)
      const response = await swaggerExecute(page, 'GET', '/v1/auth/me', 200)
      expect((await response.json()).email).toBe(customer.email)
    })
    await test.step('POST /v1/auth/refresh -> 200', async () => {
      const response = await swaggerExecute(
        page,
        'POST',
        '/v1/auth/refresh',
        200,
        {
          refreshToken,
        },
      )
      const data = await response.json()
      expect(data.refreshToken).not.toBe(refreshToken)
      refreshToken = data.refreshToken as string
    })
    await test.step('POST /v1/auth/logout -> 200', async () => {
      const response = await swaggerExecute(
        page,
        'POST',
        '/v1/auth/logout',
        200,
        {
          refreshToken,
        },
      )
      expect((await response.json()).loggedOut).toBe(true)
    })
    await test.step('Logged-out refresh is rejected -> 401', async () => {
      const before = await prisma.authSession.count({
        where: { userId: customerId },
      })
      await swaggerExecute(page, 'POST', '/v1/auth/refresh', 401, {
        refreshToken,
      })
      expect(
        await prisma.authSession.count({ where: { userId: customerId } }),
      ).toBe(before)
    })
    await test.step('Customer cannot use Admin login -> 401', async () => {
      await swaggerExecute(page, 'POST', '/v1/admin/auth/login', 401, customer)
    })
    await test.step('Customer bearer cannot access Admin profile -> 403', async () => {
      await swaggerExecute(page, 'GET', '/v1/admin/auth/me', 403)
    })
    await test.step('Prepare temporary STAFF account in isolated DB', async () => {
      const response = await swaggerExecute(
        page,
        'POST',
        '/v1/auth/register',
        201,
        staff,
      )
      staffId = (await response.json()).user.id as string
      await prisma.user.update({
        where: { id: staffId },
        data: { role: 'STAFF' },
      })
    })
    // Clear the CUSTOMER Swagger bearer token before setting STAFF token.
    await openSwagger(page)
    await test.step('POST /v1/admin/auth/login -> 200', async () => {
      const response = await swaggerExecute(
        page,
        'POST',
        '/v1/admin/auth/login',
        200,
        staff,
      )
      const data = await response.json()
      expect(data.user.role).toBe('STAFF')
      accessToken = data.accessToken as string
    })
    await test.step('GET /v1/admin/auth/me -> 200 with STAFF token', async () => {
      await authorizeInSwagger(page, accessToken)
      const response = await swaggerExecute(
        page,
        'GET',
        '/v1/admin/auth/me',
        200,
      )
      expect((await response.json()).email).toBe(staff.email)
    })
  } finally {
    // Cleanup only our random test users; no other account is modified.
    try {
      if (customerId)
        await prisma.user.deleteMany({ where: { id: customerId } })
      if (staffId) await prisma.user.deleteMany({ where: { id: staffId } })
    } finally {
      await prisma.$disconnect()
    }
  }
})
