import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { effectScope, nextTick, ref } from 'vue'
import { createTestZero, mutators, queries } from '../test/fixture'
import { useConnection } from './connection'
import { useMutation } from './mutation'
import { usePreload } from './preload'
import { useSuspenseQuery } from './suspense'

function withZero() {
  const zero = createTestZero()
  onTestFinished(async () => {
    await zero.close()
  })
  return zero
}

describe('usePreload', () => {
  it('should preload the query and clean up when the scope is disposed', () => {
    const zero = withZero()
    const cleanup = vi.fn()
    const preload = vi.spyOn(zero, 'preload').mockReturnValue({ cleanup, complete: Promise.resolve() })

    const scope = effectScope()
    scope.run(() => {
      usePreload(zero, () => queries.table(), { ttl: '1m' })
    })

    expect(preload).toHaveBeenCalledExactlyOnceWith(expect.any(Object), { ttl: '1m' })

    scope.stop()
    expect(cleanup).toHaveBeenCalledTimes(1)
  })

  it('should resolve `complete` when the preload has synced', async () => {
    const zero = withZero()
    vi.spyOn(zero, 'preload').mockReturnValue({ cleanup: () => {}, complete: Promise.resolve() })

    const scope = effectScope()
    const result = scope.run(() => usePreload(zero, () => queries.table()))!

    expect(result.complete.value).toBe(false)
    await nextTick()
    expect(result.complete.value).toBe(true)

    scope.stop()
  })

  it('should not preload while disabled', async () => {
    const zero = withZero()
    const cleanup = vi.fn()
    const preload = vi.spyOn(zero, 'preload').mockReturnValue({ cleanup, complete: Promise.resolve() })
    const enabled = ref(false)

    const scope = effectScope()
    scope.run(() => {
      usePreload(zero, () => queries.table(), () => ({ enabled: enabled.value }))
    })

    expect(preload).not.toHaveBeenCalled()

    enabled.value = true
    await nextTick()

    expect(preload).toHaveBeenCalledTimes(1)

    enabled.value = false
    await nextTick()

    expect(cleanup).toHaveBeenCalledTimes(1)
    scope.stop()
  })
})

describe('useMutation', () => {
  it('should track pending state and apply the mutation', async () => {
    const zero = withZero()
    const { mutate, pending, inFlight } = useMutation(zero, mutators.table.insert)

    expect(pending.value).toBe(false)

    const result = mutate({ a: 1, b: 'one' })
    expect(pending.value).toBe(true)
    expect(inFlight.value).toBe(1)

    const details = await result

    expect(details.type).toBe('success')
    expect(pending.value).toBe(false)
    expect(await zero.run(queries.table())).toMatchObject([{ a: 1, b: 'one' }])
  })

  it('should surface errors without throwing, and reset them', async () => {
    const zero = withZero()
    vi.spyOn(zero, 'mutate').mockImplementation(() => {
      throw new Error('nope')
    })

    const { mutate, error, pending, reset } = useMutation(zero, mutators.table.insert)
    const details = await mutate({ a: 1, b: 'one' })

    expect(details).toEqual({ type: 'error', error: { type: 'zero', message: 'nope' } })
    expect(error.value).toEqual({ type: 'zero', message: 'nope' })
    expect(pending.value).toBe(false)

    reset()
    expect(error.value).toBeUndefined()
  })

  it('should reject anything that is not a mutator', () => {
    const zero = withZero()
    // @ts-expect-error not a mutator
    expect(() => useMutation(zero, { nope: true })).toThrow(/expects a mutator/)
  })
})

describe('useSuspenseQuery', () => {
  it('should resolve once there are local rows', async () => {
    const zero = withZero()
    await zero.mutate(mutators.table.insert({ a: 1, b: 'one' })).client

    const scope = effectScope()
    const result = await scope.run(() => useSuspenseQuery(zero, () => queries.table()))!

    expect(result.data.value).toMatchObject([{ a: 1, b: 'one' }])
    scope.stop()
  })

  it('should wait for the query to settle when there are no local rows', async () => {
    const zero = withZero()
    const scope = effectScope()

    let resolved = false
    const promise = scope.run(() => useSuspenseQuery(zero, () => queries.byId(42)))!
      .then((result) => {
        resolved = true
        return result
      })

    await nextTick()
    expect(resolved).toBe(false)

    await zero.mutate(mutators.table.insert({ a: 42, b: 'answer' })).client
    const result = await promise

    expect(resolved).toBe(true)
    expect(result.data.value).toMatchObject([{ a: 42, b: 'answer' }])
    scope.stop()
  })
})

describe('useConnection', () => {
  it('should expose derived connection helpers', () => {
    const zero = withZero()
    const scope = effectScope()
    const connection = scope.run(() => useConnection(zero))!

    expect(connection.state.value).toBeDefined()
    expect(typeof connection.online.value).toBe('boolean')
    expect(connection.needsAuth.value).toBe(false)

    scope.stop()
  })

  it('should reconnect with a new token without recreating the instance', async () => {
    const zero = withZero()
    const connect = vi.spyOn(zero.connection, 'connect').mockResolvedValue()
    const scope = effectScope()
    const connection = scope.run(() => useConnection(zero))!

    await connection.reconnect('token-2')
    expect(connect).toHaveBeenCalledExactlyOnceWith({ auth: 'token-2' })

    scope.stop()
  })

  it('should unsubscribe when the scope is disposed', () => {
    const zero = withZero()
    const unsubscribe = vi.fn()
    vi.spyOn(zero.connection.state, 'subscribe').mockReturnValue(unsubscribe)

    const scope = effectScope()
    scope.run(() => useConnection(zero))
    scope.stop()

    expect(unsubscribe).toHaveBeenCalledTimes(1)
  })
})
