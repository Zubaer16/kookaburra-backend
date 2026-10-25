import { expect, type Page, type Response } from '@playwright/test'
import { URL } from 'node:url'

/**
 * Perform an actual Swagger UI Try it out -> Execute click.
 * Assertions check BOTH the HTTP response and its live rendering in Swagger.
 */
export async function swaggerExecute(
  page: Page,
  method: 'GET' | 'POST',
  endpoint: string,
  expectedStatus: number,
  body?: Record<string, string>,
): Promise<Response> {
  const escaped = endpoint.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const operation = page
    .locator(`.opblock.opblock-${method.toLowerCase()}`)
    .filter({
      has: page.locator('.opblock-summary-path', {
        hasText: new RegExp(`^${escaped}$`),
      }),
    })
  await expect(
    operation,
    `${method} ${endpoint} must be documented`,
  ).toHaveCount(1)
  if (!(await operation.locator('.opblock-body').isVisible())) {
    await operation.locator('.opblock-summary').click()
  }
  const tryButton = operation.getByRole('button', { name: 'Try it out' })
  if (await tryButton.isVisible()) await tryButton.click()
  if (body) {
    const editor = operation.locator('textarea.body-param__text')
    await expect(editor).toBeVisible()
    await editor.fill(JSON.stringify(body, null, 2))
  }
  const responseWait = page.waitForResponse((response) => {
    try {
      const url = new URL(response.url())
      return (
        response.request().method() === method &&
        url.pathname === endpoint &&
        url.host === new URL(page.url()).host
      )
    } catch {
      return false
    }
  })
  await operation.getByRole('button', { name: 'Execute', exact: true }).click()
  const result = await responseWait
  expect(result.status(), `${method} ${endpoint}`).toBe(expectedStatus)

  const live = operation.locator('.live-responses-table')
  await expect(live).toBeVisible()
  await expect(
    live.locator('tbody tr .response-col_status').first(),
  ).toContainText(String(expectedStatus))
  // Keep executed response on screen for human observation.
  await page.waitForTimeout(1200)
  console.log(`Swagger UI Execute: ${method} ${endpoint} -> ${expectedStatus}`)
  return result
}

export async function openSwagger(page: Page): Promise<void> {
  const response = await page.goto('/docs', { waitUntil: 'domcontentloaded' })
  expect(response?.status()).toBe(200)
  await expect(page.locator('.swagger-ui .opblock')).toHaveCount(8)
}

export async function authorizeInSwagger(
  page: Page,
  token: string,
): Promise<void> {
  await page.locator('.swagger-ui .scheme-container button.authorize').click()
  const modal = page.locator('.dialog-ux')
  await expect(modal).toBeVisible()
  await expect(modal.locator('.auth-container input').first()).toBeVisible()
  await modal.locator('.auth-container input').first().fill(token)
  await modal.locator('.auth-container button.authorize').click()
  await modal.locator('button.close-modal').click()
}
