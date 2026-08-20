import type { Buffer } from 'node:buffer'
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import * as net from 'node:net'
import { join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

import pg from 'pg'

const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url))
const SHARED_DIR = join(REPO_ROOT, 'test/fixtures/_shared')
const DOCKER_DIR = join(SHARED_DIR, 'docker')
const SCHEMA_FILE = join(SHARED_DIR, 'db/schema.ts')

const PG_PORT = 5430
const PG_CONN = `postgresql://user:password@127.0.0.1:${PG_PORT}/zstart`

const REPLICA_DIR = '/tmp/zero-vue-e2e-replica'
const REPLICA_FILE = join(REPLICA_DIR, 'replica')
const PID_FILE = '/tmp/zero-vue-e2e.pid'

export const ZERO_CACHE_PORT = Number(process.env.ZERO_VUE_E2E_PORT ?? 4849)
export const ZERO_CACHE_URL = `http://localhost:${ZERO_CACHE_PORT}`

// The fixture app (vite dev server or nuxt server) that zero-cache forwards
// query/mutate requests to. Live tests must serve the app on this port.
export const APP_PORT = Number(process.env.ZERO_VUE_E2E_APP_PORT ?? 3000)
export const APP_ORIGIN = `http://localhost:${APP_PORT}`

const ZERO_ADMIN_PASSWORD = 'password'

export async function setup() {
  if (process.env.ZERO_VUE_E2E_LIVE_CACHE !== '1') {
    console.warn('[e2e] skipping postgres + zero-cache (set ZERO_VUE_E2E_LIVE_CACHE=1 to enable)')
    return
  }

  process.env.ZERO_UPSTREAM_DB ??= PG_CONN
  process.env.NUXT_PUBLIC_ZERO_CACHE_URL ??= ZERO_CACHE_URL
  process.env.VITE_PUBLIC_ZERO_CACHE_URL ??= ZERO_CACHE_URL
  process.env.NUXT_PUBLIC_ZERO_QUERY_URL ??= `${APP_ORIGIN}/api/zero/query`
  process.env.NUXT_PUBLIC_ZERO_MUTATE_URL ??= `${APP_ORIGIN}/api/zero/mutate`
  process.env.VITE_PUBLIC_ZERO_QUERY_URL ??= `${APP_ORIGIN}/api/zero/query`
  process.env.VITE_PUBLIC_ZERO_MUTATE_URL ??= `${APP_ORIGIN}/api/zero/mutate`

  console.warn('[e2e] starting postgres via docker compose')
  await dockerComposeUp()

  console.warn('[e2e] waiting for postgres port')
  await waitForPort(PG_PORT, 30_000)
  await waitForPostgres(PG_CONN)
  console.warn('[e2e] postgres ready')

  console.warn('[e2e] resetting seed data')
  await resetSeed(PG_CONN)

  console.warn('[e2e] clearing replica')
  killExistingZeroCache()
  if (existsSync(REPLICA_DIR)) {
    rmSync(REPLICA_DIR, { recursive: true, force: true })
  }
  mkdirSync(REPLICA_DIR, { recursive: true })

  console.warn(`[e2e] starting zero-cache on port ${ZERO_CACHE_PORT}`)
  const proc = spawnZeroCache(ZERO_CACHE_PORT)
  writeFileSync(PID_FILE, String(proc.pid))
  await waitForPort(ZERO_CACHE_PORT, 60_000)
  console.warn('[e2e] zero-cache ready')
}

export async function teardown() {
  if (process.env.ZERO_VUE_E2E_LIVE_CACHE !== '1') {
    return
  }

  console.warn('[e2e] stopping zero-cache')
  killExistingZeroCache()

  if (process.env.KEEP_DOCKER !== '1') {
    console.warn('[e2e] stopping postgres')
    await dockerComposeDown()
  }
}

async function dockerComposeUp() {
  await runCommand('docker', ['compose', '-f', join(DOCKER_DIR, 'docker-compose.yml'), 'up', '-d'], { cwd: DOCKER_DIR })
}

async function dockerComposeDown() {
  try {
    await runCommand('docker', ['compose', '-f', join(DOCKER_DIR, 'docker-compose.yml'), 'down', '-v'], { cwd: DOCKER_DIR })
  }
  catch (error) {
    console.warn('[e2e] docker compose down failed (ignored):', (error as Error).message)
  }
}

async function runCommand(cmd: string, args: string[], opts: { cwd?: string } = {}): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { cwd: opts.cwd, stdio: 'inherit' })
    proc.on('exit', code => code === 0 ? resolve() : reject(new Error(`${cmd} ${args.join(' ')} exited with ${code}`)))
    proc.on('error', reject)
  })
}

async function waitForPort(port: number, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs
  return new Promise((resolve, reject) => {
    const tryConnect = () => {
      const socket = new net.Socket()
      socket.setTimeout(1000)
      const retry = (err?: Error) => {
        socket.destroy()
        if (Date.now() >= deadline) {
          reject(err ?? new Error(`Port ${port} not available within ${timeoutMs}ms`))
          return
        }
        setTimeout(tryConnect, 500)
      }
      socket.once('connect', () => {
        socket.destroy()
        resolve()
      })
      socket.once('timeout', () => retry())
      socket.once('error', err => retry(err))
      socket.connect(port, '127.0.0.1')
    }
    tryConnect()
  })
}

async function waitForPostgres(connStr: string, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const pool = new pg.Pool({ connectionString: connStr, max: 1 })
    try {
      const client = await pool.connect()
      client.release()
      await pool.end()
      return
    }
    catch {
      try {
        await pool.end()
      }
      catch {}
      await sleep(500)
    }
  }
  throw new Error('postgres not ready within timeout')
}

async function resetSeed(connStr: string) {
  const pool = new pg.Pool({ connectionString: connStr, max: 1 })
  try {
    await pool.query('TRUNCATE TABLE "message", "medium", "user" RESTART IDENTITY CASCADE')
    await pool.query(`
      INSERT INTO "user" (id, name, partner) VALUES
        ('ycD76wW4R2', 'Aaron', true),
        ('IoQSaxeVO5', 'Matt', true),
        ('WndZWmGkO4', 'Cesar', true),
        ('ENzoNm7g4E', 'Erik', true),
        ('dLKecN3ntd', 'Greg', true),
        ('enVvyDlBul', 'Darick', true),
        ('9ogaDuDNFx', 'Alex', true),
        ('6z7dkeVLNm', 'Dax', false),
        ('7VoEoJWEwn', 'Nate', false);
      INSERT INTO "medium" (id, name) VALUES
        ('G14bSFuNDq', 'Discord'),
        ('b7rqt_8w_H', 'Twitter DM'),
        ('0HzSMcee_H', 'Tweet reply to unrelated thread'),
        ('ttx7NCmyac', 'SMS');
    `)
  }
  finally {
    await pool.end()
  }
}

function spawnZeroCache(port: number) {
  const binDir = join(REPO_ROOT, 'node_modules', '.bin')
  const bin = join(binDir, 'zero-cache-dev')
  const command = existsSync(bin) ? bin : 'zero-cache-dev'

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PATH: `${binDir}:${process.env.PATH ?? ''}`,
    ZERO_UPSTREAM_DB: PG_CONN,
    ZERO_REPLICA_FILE: REPLICA_FILE,
    ZERO_LOG_LEVEL: 'error',
    ZERO_ENABLE_STARTUP_MESSAGE: '0',
    ZERO_ADMIN_PASSWORD,
    ZERO_QUERY_URL: `${APP_ORIGIN}/api/zero/query`,
    ZERO_QUERY_FORWARD_COOKIES: 'true',
    ZERO_MUTATE_URL: `${APP_ORIGIN}/api/zero/mutate`,
    ZERO_MUTATE_FORWARD_COOKIES: 'true',
  }

  const proc = spawn(command, ['-p', SCHEMA_FILE, '--port', String(port)], {
    cwd: REPO_ROOT,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  })

  proc.stdout?.on('data', (d: Buffer) => process.stdout.write(`[zero-cache] ${d}`))
  proc.stderr?.on('data', (d: Buffer) => process.stderr.write(`[zero-cache] ${d}`))
  proc.on('exit', (code) => {
    if (code !== null && code !== 0) {
      console.error(`[zero-cache] exited with code ${code}`)
    }
  })
  proc.unref()
  return proc
}

function killExistingZeroCache() {
  if (!existsSync(PID_FILE)) {
    return
  }
  const pid = Number.parseInt(readFileSync(PID_FILE, 'utf-8').trim(), 10)
  rmSync(PID_FILE, { force: true })
  if (Number.isNaN(pid)) {
    return
  }
  sendSignal(pid, 'SIGTERM')
  // Cheap insurance against a zero-cache that ignores SIGTERM: poll the PID
  // and escalate to SIGKILL if it's still alive after 2s. The liveness probe
  // (signal 0) doesn't fully protect against PID reuse, but the race window
  // is small and the cost of a leaked zero-cache (port 4849 stuck busy for
  // the next run) is the higher risk we're trading against.
  setTimeout(() => {
    if (isAlive(pid)) {
      sendSignal(pid, 'SIGKILL')
    }
  }, 2000).unref()
}

function sendSignal(pid: number, signal: NodeJS.Signals) {
  try {
    process.kill(-pid, signal)
  }
  catch {}
  try {
    process.kill(pid, signal)
  }
  catch {}
}

function isAlive(pid: number) {
  try {
    process.kill(pid, 0)
    return true
  }
  catch {
    return false
  }
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}
