import { expect, type Page, type Response } from '@playwright/test'
import { URL } from 'node:url'

export type SwaggerMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'
type Params = Record<string, string | number>

/** Execute a real Swagger UI operation and assert the browser's network
 * response AND the status shown by Swagger. Existing Phase 02 call sites are
 * backward-compatible; the optional params handle templated path/query APIs.
 */
export async function swaggerExecute(
  page: Page,
  method: SwaggerMethod,
  endpoint: string,
  expectedStatus: number,
  body?: unknown,
  pathParams: Params = {},
  queryParams: Params = {},
  headerParams: Params = {},
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

  for (const [location, values] of [
    ['path', pathParams],
    ['query', queryParams],
    ['header', headerParams],
  ] as const) {
    for (const [key, value] of Object.entries(values)) {
      const row = operation.locator(
        `tr[data-param-name="${key}"][data-param-in="${location}"]`,
      )
      await expect(row, `Swagger ${location} parameter ${key}`).toHaveCount(1)
      const input = row
        .locator('input:not([type="checkbox"]), textarea, select')
        .first()
      await expect(input).toBeVisible()
      // Swagger renders enum query parameters (for example, lowStock) as
      // <select> elements. Playwright's fill() only supports text controls.
      // Use the actual dropdown options rather than bypassing Swagger UI.
      if (await input.evaluate((element) => element.tagName === 'SELECT')) {
        await input.selectOption(String(value))
      } else {
        await input.fill(String(value))
        // Swagger UI uses controlled React inputs for required headers.
        // Commit that edit before Execute; other parameter flows stay intact.
        if (location === 'header') {
          await input.press('Tab')
          await expect(input, `header ${key} must retain its value`).toHaveValue(String(value))
        }
      }
    }
  }

  if (body !== undefined) {
    const editor = operation.locator('textarea.body-param__text')
    await expect(editor).toBeVisible()
    await editor.fill(
      typeof body === 'string' ? body : JSON.stringify(body, null, 2),
    )
  }

  const actualPath = endpoint.replace(/\{([^}]+)\}/g, (_match, key: string) => {
    if (!(key in pathParams))
      throw new Error(`Missing Swagger path param: ${key}`)
    return encodeURIComponent(String(pathParams[key]))
  })
  // Wait only for a matching HTTP request, never for the entire test timeout.
  // Swagger's form controls may reject an input before the browser sends any
  // request; in that case fail with a useful diagnostic instead of hanging.
  const observed: string[] = []
  const observeResponse = (response: Response) => {
    try {
      const url = new URL(response.url())
      if (
        response.request().method() === method &&
        decodeURIComponent(url.pathname) === decodeURIComponent(actualPath)
      ) {
        const queryMatches = Object.entries(queryParams).every(
          ([name, value]) => url.searchParams.get(name) === String(value),
        )
        observed.push(
          `${response.status()} ${method} ${url.pathname} (query matches: ${queryMatches})`,
        )
      }
    } catch {
      // Ignore unrelated non-HTTP browser resources.
    }
  }
  page.on('response', observeResponse)
  try {
    const [result] = await Promise.all([
      page.waitForResponse(
        (response) => {
          try {
            const url = new URL(response.url())
            return (
              response.request().method() === method &&
              decodeURIComponent(url.pathname) ===
                decodeURIComponent(actualPath) &&
              url.host === new URL(page.url()).host &&
              Object.entries(queryParams).every(
                ([name, value]) => url.searchParams.get(name) === String(value),
              )
            )
          } catch {
            return false
          }
        },
        { timeout: 25_000 },
      ),
      operation.getByRole('button', { name: 'Execute', exact: true }).click(),
    ]).catch(async (error: unknown) => {
      // Collect safe form diagnostics without printing capability/JWT values.
      // The Playwright screenshot/trace retains full UI state locally.
      const invalidFields = await operation.locator('input:invalid, textarea:invalid, select:invalid, [aria-invalid="true"]').count().catch(() => -1)
      const validationRows = await operation.locator('.errors-wrapper, .parameter__error, .validation-errors').count().catch(() => -1)
      const disabledExecute = await operation.getByRole('button', { name: 'Execute', exact: true }).isDisabled().catch(() => false)
      const details = observed.length
        ? observed.join('; ')
        : `No matching-path response; invalidFields=${invalidFields}, validationRows=${validationRows}, executeDisabled=${disabledExecute}. See local Playwright screenshot/trace for Swagger form validation.`
      throw new Error(
        `Swagger Execute failed: ${method} ${actualPath}; ${details}`,
        { cause: error },
      )
    })
    // Catch Swagger UI form/header regressions before trusting the HTTP status.
    // Sensitive header values are asserted locally, never logged.
    for (const [name, value] of Object.entries(headerParams)) {
      expect(
        result.request().headers()[name.toLowerCase()],
        `Swagger must actually send the ${name} header`,
      ).toBe(String(value))
    }
    expect(result.status(), `${method} ${actualPath}`).toBe(expectedStatus)
    const live = operation.locator('.live-responses-table')
    await expect(live).toBeVisible()
    await expect(
      live.locator('tbody tr .response-col_status').first(),
    ).toContainText(String(expectedStatus))
    console.log(
      `Swagger UI Execute: ${method} ${actualPath} -> ${expectedStatus}`,
    )
    return result
  } finally {
    page.off('response', observeResponse)
  }
}

export async function openSwagger(page: Page): Promise<void> {
  const response = await page.goto('/docs', { waitUntil: 'domcontentloaded' })
  expect(response?.status()).toBe(200)
  // Future API milestones may add operations; never hardcode Phase 02's 8.
  await expect(page.locator('.swagger-ui .opblock').first()).toBeVisible()
}

/** Authorize only the named security scheme. The UI now has two schemes:
 * customer JWT and an independent guest API-key capability. Never assume
 * that the first modal input is the intended security scheme.
 */
async function authorizeSchemeInSwagger(
  page: Page,
  schemeName: 'access-token' | 'guest-cart-token',
  token: string,
): Promise<void> {
  await page.locator('.swagger-ui .scheme-container button.authorize').click()
  const modal = page.locator('.dialog-ux')
  await expect(modal).toBeVisible()
  const scheme = modal.locator('.auth-container').filter({ hasText: schemeName })
  await expect(scheme, `Authorize ${schemeName} independently`).toHaveCount(1)
  // Swagger's authorization modal shows Logout for a scheme that already
  // has a token. Clear it before entering a replacement invalid/valid token.
  // The Swagger UI auth dialog's button has a stable CSS class `authorize`,
  // but its computed accessible name is not guaranteed to be exactly
  // "Authorize" (particularly for API-key schemes). The strict role/name
  // selector previously waited until the entire 4-minute test timed out.
  // Both schemes render the same auth-container controls.
  const logout = scheme.getByRole('button', {
    name: 'Remove authorization',
    exact: true,
  })
  if (await logout.isVisible()) await logout.click({ timeout: 5_000 })
  const input = scheme.locator('input').first()
  await expect(input).toBeVisible({ timeout: 5_000 })
  await input.fill(token)
  const submit = scheme.locator('button.authorize')
  await expect(submit, `${schemeName} credential submit control`).toHaveCount(1, { timeout: 5_000 })
  await expect(submit).toBeVisible({ timeout: 5_000 })
  await expect(submit).toBeEnabled({ timeout: 5_000 })
  await submit.click({ timeout: 5_000 })
  await modal.locator('button.close-modal').click({ timeout: 5_000 })
}

export async function authorizeInSwagger(page: Page, token: string): Promise<void> {
  await authorizeSchemeInSwagger(page, 'access-token', token)
}

export async function authorizeGuestCartInSwagger(page: Page, token: string): Promise<void> {
  await authorizeSchemeInSwagger(page, 'guest-cart-token', token)
}
