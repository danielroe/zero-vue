import { fileURLToPath } from 'node:url'
import { $fetch, fetch, setup } from '@nuxt/test-utils/e2e'
import { jwtVerify } from 'jose'
import { describe, expect, it } from 'vitest'

const authSecret = 'test-secret-for-e2e'

await setup({
  rootDir: fileURLToPath(new URL('..', import.meta.url)),
  env: {
    NUXT_ZERO_AUTH_SECRET: authSecret,
  },
})

const seededUserIDs = new Set([
  '6z7dkeVLNm',
  'ycD76wW4R2',
  'IoQSaxeVO5',
  'WndZWmGkO4',
  'ENzoNm7g4E',
  'dLKecN3ntd',
  '7VoEoJWEwn',
  'enVvyDlBul',
  '9ogaDuDNFx',
])

describe('nuxt fixture', () => {
  it('renders the SSR page without a jwt cookie', async () => {
    const html = await $fetch<string>('/')
    expect(html).toContain('<title>zero-vue x Nuxt</title>')
    expect(html).toContain('Add Messages')
    expect(html).toContain('Remove Messages')
    expect(html).toContain('Login')
  })

  it('issues a signed jwt cookie from /api/login', async () => {
    const response = await fetch('/api/login')
    expect(response.status).toBe(200)

    const setCookie = response.headers.getSetCookie?.() ?? [response.headers.get('set-cookie') ?? '']
    const jwtCookie = setCookie.find(c => c.startsWith('jwt='))
    expect(jwtCookie).toBeDefined()

    const jwt = jwtCookie!.split(';')[0]!.slice('jwt='.length)
    const { payload } = await jwtVerify(jwt, new TextEncoder().encode(authSecret))
    expect(typeof payload.sub).toBe('string')
    expect(seededUserIDs.has(payload.sub as string)).toBe(true)
  })

  it('renders without crashing when a jwt cookie is present on SSR', async () => {
    const loginResponse = await fetch('/api/login')
    const setCookie = loginResponse.headers.getSetCookie?.() ?? [loginResponse.headers.get('set-cookie') ?? '']
    const jwtCookie = setCookie.find(c => c.startsWith('jwt='))!.split(';')[0]!

    const response = await fetch('/', { headers: { cookie: jwtCookie } })
    expect(response.status).toBe(200)
    const html = await response.text()
    expect(html).toContain('<title>zero-vue x Nuxt</title>')
    expect(html).toContain('Add Messages')
  })
})
