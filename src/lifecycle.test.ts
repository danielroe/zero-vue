import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { effectScope, nextTick, ref } from 'vue'
import { createTestZero, queries } from '../test/fixture'
import { useQuery } from './query'
import { activeViewCountForTesting } from './view-store'

function withZero() {
  const zero = createTestZero()
  onTestFinished(async () => {
    await zero.close()
  })
  return zero
}

describe('useQuery lifecycle', () => {
  it('should destroy its view when the surrounding effect scope is disposed', async () => {
    const zero = withZero()
    const scope = effectScope()

    scope.run(() => {
      useQuery(zero, () => queries.table())
    })

    expect(activeViewCountForTesting(zero)).toBe(1)

    scope.stop()
    await nextTick()

    expect(activeViewCountForTesting(zero)).toBe(0)
  })

  it('should stop its watchers when the surrounding effect scope is disposed', async () => {
    const zero = withZero()
    const scope = effectScope()
    const a = ref(1)
    const queryGetter = vi.fn(() => queries.byId(a.value))

    scope.run(() => {
      useQuery(zero, queryGetter)
    })
    expect(queryGetter).toHaveBeenCalledTimes(1)

    scope.stop()
    a.value = 2
    await nextTick()

    expect(queryGetter).toHaveBeenCalledTimes(1)
  })

  it('should share a single view between consumers of the same query', async () => {
    const zero = withZero()
    const materializeSpy = vi.spyOn(zero, 'materialize')
    const scope = effectScope()

    let first: ReturnType<typeof useQuery> | undefined
    const inner = effectScope()

    scope.run(() => {
      first = useQuery(zero, () => queries.table())
    })
    inner.run(() => {
      useQuery(zero, () => queries.table())
    })

    expect(materializeSpy).toHaveBeenCalledTimes(1)
    expect(activeViewCountForTesting(zero)).toBe(1)

    inner.stop()
    await nextTick()

    expect(activeViewCountForTesting(zero)).toBe(1)
    expect(first!.status.value).not.toBe('disabled')

    scope.stop()
    await nextTick()

    expect(activeViewCountForTesting(zero)).toBe(0)
  })

  it('should not share views between different queries', () => {
    const zero = withZero()
    const scope = effectScope()

    scope.run(() => {
      useQuery(zero, () => queries.byId(1))
      useQuery(zero, () => queries.byId(2))
    })

    expect(activeViewCountForTesting(zero)).toBe(2)
    scope.stop()
  })

  it('should give a shared view the longest requested ttl', async () => {
    const zero = withZero()
    const materializeSpy = vi.spyOn(zero, 'materialize')
    const scope = effectScope()

    scope.run(() => {
      useQuery(zero, () => queries.table(), { ttl: '1m' })
    })

    const view = materializeSpy.mock.results[0]!.value
    const updateTTL = vi.spyOn(view, 'updateTTL')

    const inner = effectScope()
    inner.run(() => {
      useQuery(zero, () => queries.table(), { ttl: '10m' })
    })

    expect(materializeSpy).toHaveBeenCalledTimes(1)
    expect(updateTTL).toHaveBeenCalledExactlyOnceWith('10m')

    inner.stop()
    await nextTick()

    expect(updateTTL).toHaveBeenLastCalledWith('1m')
    scope.stop()
  })

  it('should tear down the view when disabled and rebuild it when re-enabled', async () => {
    const zero = withZero()
    const enabled = ref(true)
    const scope = effectScope()

    let result!: ReturnType<typeof useQuery>
    scope.run(() => {
      result = useQuery(zero, () => queries.table(), () => ({ enabled: enabled.value }))
    })

    expect(activeViewCountForTesting(zero)).toBe(1)
    expect(result.status.value).not.toBe('disabled')

    enabled.value = false
    await nextTick()

    expect(activeViewCountForTesting(zero)).toBe(0)
    expect(result.status.value).toBe('disabled')
    expect(result.data.value).toBeUndefined()

    enabled.value = true
    await nextTick()

    expect(activeViewCountForTesting(zero)).toBe(1)
    expect(result.status.value).not.toBe('disabled')

    scope.stop()
  })

  it('should throw a helpful error when there is no Zero instance to use', () => {
    const zero = withZero()
    const scope = effectScope()

    expect(() => scope.run(() => useQuery(() => zero as never))).toThrow(/No Zero instance available/)
    scope.stop()
  })
})
