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
    ]).catch((error: unknown) => {
      const details = observed.length
        ? observed.join('; ')
        : 'No matching-path HTTP response was observed. Swagger may have blocked the request at the form-validation layer.'
      throw new Error(
        `Swagger Execute failed: ${method} ${actualPath}; ${details}`,
        { cause: error },
      )
    })
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
