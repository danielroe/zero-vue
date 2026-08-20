import type { Browser, Page } from 'playwright-core'
import type { ViteDevServer } from 'vite'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

import { chromium } from 'playwright-core'
import { createServer } from 'vite'
import { afterAll, beforeAll, describe, it } from 'vitest'
import { expectAddMessageGrowsTable, expectSeededUsersToSync, loginViaUI, pipePageLogs } from '../../../e2e/helpers'

const LIVE = process.env.ZERO_VUE_E2E_LIVE_CACHE === '1'
const FIXTURE_ROOT = fileURLToPath(new URL('..', import.meta.url))

// zero-cache forwards query/mutate requests to this origin, so the port has
// to match APP_PORT in the e2e global setup.
const APP_PORT = 3000
const BASE_URL = `http://localhost:${APP_PORT}`

let server: ViteDevServer
let browser: Browser
let page: Page

beforeAll(async () => {
  if (!LIVE) {
    return
  }

  // vitest global setup runs in a separate process, so its env mutations
  // don't reach this worker; point the client at the live cache explicitly.
  // Values set here take precedence over the fixture .env in vite's loadEnv.
  process.env.VITE_PUBLIC_ZERO_CACHE_URL = 'http://localhost:4849'

  server = await createServer({
    configFile: fileURLToPath(new URL('../vite.config.ts', import.meta.url)),
    root: FIXTURE_ROOT,
    server: { port: APP_PORT, strictPort: true },
    logLevel: 'error',
  })
  await server.listen()

  browser = await chromium.launch()
  page = await browser.newPage()
  pipePageLogs(page)
}, 180_000)

afterAll(async () => {
  await browser?.close()
  await server?.close()
})

describe.skipIf(!LIVE)('vue spa against a live zero-cache', () => {
  it('syncs seeded users into the sender filter on first load', async () => {
    await page.goto(BASE_URL)
    await expectSeededUsersToSync(page)
  })

  it('reactively appends a row when the user adds a message', async () => {
    await page.goto(BASE_URL)
    await expectSeededUsersToSync(page)
    await loginViaUI(page)
    await expectAddMessageGrowsTable(page)
  })
})
