import type { Page } from 'playwright-core'
import { expect } from 'vitest'

const SEED_WAIT_MS = 30_000
const MUTATION_WAIT_MS = 15_000

/**
 * Wait until the sender filter `<select>` has hydrated with the seeded users
 * and assert that at least Aaron, Erik and Matt are present.
 *
 * Used by both the Vue SPA fixture and the Nuxt fixture, which render the same
 * UI shape against the same seed data, so the assertions are shared.
 */
export async function expectSeededUsersToSync(page: Page) {
  await page.waitForFunction(
    () => Array.from(document.querySelectorAll('select option')).some(o => o.textContent?.trim() === 'Aaron'),
    undefined,
    { timeout: SEED_WAIT_MS },
  )
  const senderOptionTexts = await page.locator('select option').allTextContents()
  expect(senderOptionTexts).toEqual(expect.arrayContaining(['Aaron', 'Erik', 'Matt']))
}

/**
 * Log in via the fixture UI. Clicking `Login` fetches `/api/login` (which sets
 * the jwt cookie) and reloads the page, so wait for the `Logout` button that
 * only renders for an authenticated user. The page must be hydrated before
 * calling this (e.g. via `expectSeededUsersToSync`), or the click lands on
 * inert SSR markup.
 */
export async function loginViaUI(page: Page) {
  await page.getByRole('button', { name: 'Login' }).click()
  try {
    await page.getByRole('button', { name: 'Logout' }).waitFor({ timeout: SEED_WAIT_MS })
  }
  catch (error) {
    const cookies = await page.context().cookies()
    console.error(`[e2e] login did not complete. url=${page.url()} cookies=${cookies.map(c => c.name).join(',') || '(none)'}`)
    console.error(`[e2e] page content:\n${(await page.content()).slice(0, 3000)}`)
    throw error
  }
}

/**
 * Forward browser console messages and page errors to the test runner's
 * stdio, so CI logs show what happened inside the page.
 */
export function pipePageLogs(page: Page) {
  page.on('console', message => console.warn(`[browser:${message.type()}] ${message.text()}`))
  page.on('pageerror', error => console.error(`[browser:pageerror] ${error.message}`))
}

/**
 * Click `Add Messages`, wait for the table to grow, and assert that the row
 * count strictly increased. Assumes the user is logged in and seeded users /
 * mediums have already synced (call `loginViaUI` and `expectSeededUsersToSync`
 * first).
 */
export async function expectAddMessageGrowsTable(page: Page) {
  const before = await page.locator('table tbody tr').count()
  const addButton = page.getByRole('button', { name: 'Add Messages' })
  await expect.poll(() => addButton.isEnabled(), { timeout: MUTATION_WAIT_MS }).toBe(true)
  await addButton.dispatchEvent('mousedown')
  await addButton.dispatchEvent('mouseup')

  await page.waitForFunction(
    (prev: number) => document.querySelectorAll('table tbody tr').length > prev,
    before,
    { timeout: MUTATION_WAIT_MS },
  )

  const after = await page.locator('table tbody tr').count()
  expect(after).toBeGreaterThan(before)
}
