import type { AddressInfo } from 'node:net'
import type { ViteDevServer } from 'vite'
import { fileURLToPath } from 'node:url'
import { jwtVerify } from 'jose'
import { createServer } from 'vite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { seededUserIDs } from '../../_shared/db/data/seeded-users'

const authSecret = 'authSecret'

let server: ViteDevServer
let baseURL: string

beforeAll(async () => {
  server = await createServer({
    configFile: fileURLToPath(new URL('../vite.config.ts', import.meta.url)),
    root: fileURLToPath(new URL('..', import.meta.url)),
    server: { host: '127.0.0.1' },
    logLevel: 'error',
  })
  await server.listen()
  const { port } = server.httpServer!.address() as AddressInfo
  baseURL = `http://127.0.0.1:${port}`
})

afterAll(async () => {
  await server?.close()
})

async function login() {
  const response = await fetch(`${baseURL}/api/login`)
  expect(response.status).toBe(200)

  const setCookie = response.headers.getSetCookie()
  const jwtCookie = setCookie.find(c => c.startsWith('jwt='))
  expect(jwtCookie).toBeDefined()
  return jwtCookie!.split(';')[0]!
}

describe('vue fixture', () => {
  it('renders the index page', async () => {
    const response = await fetch(baseURL)
    expect(response.status).toBe(200)
    const html = await response.text()
    expect(html).toContain('<div id="app">')
  })

  it('issues a signed jwt cookie from /api/login', async () => {
    const cookie = await login()
    const jwt = cookie.slice('jwt='.length)
    const { payload } = await jwtVerify(jwt, new TextEncoder().encode(authSecret))
    expect(typeof payload.sub).toBe('string')
    expect(seededUserIDs).toContain(payload.sub)
  })

  it('transforms a named query on /api/zero/query', async () => {
    const cookie = await login()
    const response = await fetch(`${baseURL}/api/zero/query`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie,
      },
      body: JSON.stringify(['transform', [{ id: 'q1', name: 'messages.all', args: [] }]]),
    })
    expect(response.status).toBe(200)

    const body = await response.json() as { kind: string, queries: Array<{ id: string, ast?: unknown, error?: string }> }
    expect(body.kind).toBe('QueryResponse')
    expect(body.queries).toHaveLength(1)
    expect(body.queries[0]!.id).toBe('q1')
    expect(body.queries[0]!.error).toBeUndefined()
    expect(body.queries[0]!.ast).toBeDefined()
  })

  it('returns a parse error for a malformed query request', async () => {
    const response = await fetch(`${baseURL}/api/zero/query`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ nonsense: true }),
    })
    expect(response.status).toBe(200)

    const body = await response.json() as { kind: string }
    expect(body.kind).toBe('TransformFailed')
  })
})
