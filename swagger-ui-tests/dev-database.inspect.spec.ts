import { expect, test } from '@playwright/test'
import { randomBytes, randomUUID } from 'node:crypto'
import { URL } from 'node:url'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client'
import {
  authorizeInSwagger,
  openSwagger,
  swaggerExecute,
} from './swagger-helper'

// This intentionally PERSISTS two clearly marked dev-inspection users.
// It is NOT a regular CI or destructive integration test.
function inspectionDb(): PrismaClient {
  if (
    process.env.API_TEST_MODE !== 'dev-inspect' ||
    process.env.API_DEV_INSPECT_APPROVED !== 'YES' ||
    process.env.API_TEST_PORT !== '4102' ||
    !process.env.DATABASE_URL
  ) {
    throw new Error('Use npm run test:api:visual:dev (guarded launcher only)')
  }
  const url = new URL(process.env.DATABASE_URL)
  if (
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname.toLowerCase()) ||
    decodeURIComponent(url.pathname.slice(1)) !== 'kookaburra-api-dev'
  ) {
    throw new Error('Refusing non-local or unexpected development database')
  }
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  })
}

function credentials(kind: string): { email: string; password: string } {
  return {
    email: `visual-dev-${kind}-${randomUUID()}@example.test`,
    password: `VisualDev-${randomBytes(18).toString('hex')}!`,
  }
}

test('Swagger walkthrough using REAL local development DB; records retained', async ({
  page,
}) => {
  const db = inspectionDb()
  const customer = credentials('customer')
  const staff = credentials('staff')
  let customerId: string | undefined
  let staffId: string | undefined
  let accessToken = ''
  let refreshToken = ''
  try {
    await openSwagger(page)
    await test.step('01 Health GET /v1/health — 200', async () => {
      await swaggerExecute(page, 'GET', '/v1/health', 200)
    })
    await test.step('02 Invalid Customer registration — 400', async () => {
      await swaggerExecute(page, 'POST', '/v1/auth/register', 400, {
        email: 'not-an-email',
        password: 'short',
      })
    })
    await test.step('03 Real Customer registration — 201 + persisted row', async () => {
      const response = await swaggerExecute(
        page,
        'POST',
        '/v1/auth/register',
        201,
        customer,
      )
      const payload = await response.json()
      customerId = payload.user.id as string
      expect(payload.user).toMatchObject({
        email: customer.email,
        role: 'CUSTOMER',
      })
      const persisted = await db.user.findUnique({ where: { id: customerId } })
      expect(persisted?.email).toBe(customer.email)
      console.log(`Persisted CUSTOMER in local DB: ${customer.email}`)
    })
    await test.step('04 Duplicate Customer registration — 409', async () => {
      await swaggerExecute(page, 'POST', '/v1/auth/register', 409, customer)
    })
    await test.step('05 Wrong Customer password — 401', async () => {
      await swaggerExecute(page, 'POST', '/v1/auth/login', 401, {
        email: customer.email,
        password: `Wrong-${randomBytes(18).toString('hex')}!`,
      })
    })
    await test.step('06 Real Customer login — 200', async () => {
      const response = await swaggerExecute(
        page,
        'POST',
        '/v1/auth/login',
        200,
        customer,
      )
      const payload = await response.json()
      accessToken = payload.accessToken as string
      refreshToken = payload.refreshToken as string
      expect(accessToken).toEqual(expect.any(String))
    })
    await test.step('07 Customer profile without JWT — 401', async () => {
      await swaggerExecute(page, 'GET', '/v1/auth/me', 401)
    })
    await test.step('08 Customer profile with JWT — 200', async () => {
      await authorizeInSwagger(page, accessToken)
      const response = await swaggerExecute(page, 'GET', '/v1/auth/me', 200)
      expect((await response.json()).email).toBe(customer.email)
    })
    await test.step('09 Customer refresh — 200 + new refresh token', async () => {
      const response = await swaggerExecute(
        page,
        'POST',
        '/v1/auth/refresh',
        200,
        { refreshToken },
      )
      const payload = await response.json()
      expect(payload.refreshToken).not.toBe(refreshToken)
      refreshToken = payload.refreshToken as string
    })
    await test.step('10 Customer logout — 200', async () => {
      const response = await swaggerExecute(
        page,
        'POST',
        '/v1/auth/logout',
        200,
        { refreshToken },
      )
      expect((await response.json()).loggedOut).toBe(true)
    })
    await test.step('11 Logged-out refresh token is rejected — 401', async () => {
      await swaggerExecute(page, 'POST', '/v1/auth/refresh', 401, {
        refreshToken,
      })
    })
    await test.step('12 Customer cannot use Admin login — 401', async () => {
      await swaggerExecute(page, 'POST', '/v1/admin/auth/login', 401, customer)
    })
    await test.step('13 Customer JWT cannot read Admin profile — 403', async () => {
      await swaggerExecute(page, 'GET', '/v1/admin/auth/me', 403)
    })

    // Temporarily elevate ONLY the account created by this run. After the
    // walkthrough it is permanently DISABLED and all sessions are revoked.
    await test.step('14 Prepare explicitly named temporary STAFF test user', async () => {
      const response = await swaggerExecute(
        page,
        'POST',
        '/v1/auth/register',
        201,
        staff,
      )
      staffId = (await response.json()).user.id as string
      await db.user.update({ where: { id: staffId }, data: { role: 'STAFF' } })
    })
    await openSwagger(page)
    await test.step('15 Real Admin login — 200', async () => {
      const response = await swaggerExecute(
        page,
        'POST',
        '/v1/admin/auth/login',
        200,
        staff,
      )
      const payload = await response.json()
      expect(payload.user.role).toBe('STAFF')
      accessToken = payload.accessToken as string
    })
    await test.step('16 Admin profile with staff JWT — 200', async () => {
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
    try {
      // Do not keep privileged test accounts or live tokens from a browser trace.
      if (staffId) {
        await db.user.updateMany({
          where: { id: staffId, email: staff.email },
          data: { status: 'DISABLED' },
        })
        await db.authSession.updateMany({
          where: { userId: staffId, revokedAt: null },
          data: { revokedAt: new Date() },
        })
        console.log(`Persisted DISABLED STAFF inspection row: ${staff.email}`)
      }
      if (customerId) {
        await db.authSession.updateMany({
          where: { userId: customerId, revokedAt: null },
          data: { revokedAt: new Date() },
        })
        console.log(`Retained CUSTOMER inspection row: ${customer.email}`)
      }
    } finally {
      await db.$disconnect()
    }
  }
})
