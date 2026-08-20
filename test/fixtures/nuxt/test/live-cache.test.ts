import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { $fetch, createPage, setup } from '@nuxt/test-utils/e2e'
import { describe, expect, it } from 'vitest'
import { expectAddMessageGrowsTable, expectSeededUsersToSync, loginViaUI, pipePageLogs } from '../../../e2e/helpers'

const LIVE = process.env.ZERO_VUE_E2E_LIVE_CACHE === '1'

// zero-cache forwards query/mutate requests to this origin, so the port has
// to match APP_PORT in the e2e global setup.
const APP_PORT = 3000

if (LIVE) {
  await setup({
    rootDir: fileURLToPath(new URL('..', import.meta.url)),
    port: APP_PORT,
    env: {
      NUXT_AUTH_SECRET: 'test-secret-for-e2e',
      NUXT_PUBLIC_ZERO_SSR: 'true',
      NUXT_PUBLIC_ZERO_CACHE_URL: process.env.NUXT_PUBLIC_ZERO_CACHE_URL ?? 'http://localhost:4849',
      NUXT_PUBLIC_ZERO_QUERY_URL: `http://localhost:${APP_PORT}/api/zero/query`,
      NUXT_PUBLIC_ZERO_MUTATE_URL: `http://localhost:${APP_PORT}/api/zero/mutate`,
      ZERO_UPSTREAM_DB: process.env.ZERO_UPSTREAM_DB ?? 'postgresql://user:password@127.0.0.1:5430/zstart',
    },
    browser: true,
  })
}

describe.skipIf(!LIVE)('nuxt fixture against a live zero-cache', () => {
  it('hydrates and syncs seeded users from zero-cache', async () => {
    const page = await createPage('/')
    try {
      await expectSeededUsersToSync(page)
    }
    finally {
      await page.close()
    }
  })

  it('reactively appends a row when the user adds a message', async () => {
    const page = await createPage('/')
    pipePageLogs(page)
    try {
      await expectSeededUsersToSync(page)
      await loginViaUI(page)
      await expectAddMessageGrowsTable(page)
    }
    finally {
      await page.close()
    }
  })

  it('includes seeded users in the SSR HTML (issue #21)', async () => {
    const html = await $fetch<string>('/')
    expect(html).toContain('<title>zero-vue x Nuxt</title>')
    expect(html).toContain('Aaron')
    expect(html).toContain('Erik')
  })

  it('does not leak the zero-cache websocket url into the SSR markup', async () => {
    const html = await $fetch<string>('/')
    expect(html).not.toMatch(/ws:\/\/[^\s"']+/)
  })
})
