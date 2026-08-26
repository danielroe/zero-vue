import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { createTestZero, queries } from '../test/fixture'
import { acquireView, activeViewCountForTesting } from './view-store'

function withZero() {
  const zero = createTestZero()
  onTestFinished(async () => {
    await zero.close()
  })
  return zero
}

const KEY = 'test-key'

describe('acquireView', () => {
  it('materializes once for several holders and destroys on last release', () => {
    const zero = withZero()
    const materialize = vi.spyOn(zero, 'materialize')

    const first = acquireView(zero, queries.table(), KEY, '1m')
    const second = acquireView(zero, queries.table(), KEY, '1m')

    expect(materialize).toHaveBeenCalledTimes(1)
    expect(first.view.value).toBe(second.view.value)

    const destroy = vi.spyOn(first.view.value, 'destroy')

    first.release()
    expect(destroy).not.toHaveBeenCalled()
    expect(activeViewCountForTesting(zero)).toBe(1)

    second.release()
    expect(destroy).toHaveBeenCalledTimes(1)
    expect(activeViewCountForTesting(zero)).toBe(0)
  })

  it('hands every holder the new view after a retry', () => {
    const zero = withZero()
    const materialize = vi.spyOn(zero, 'materialize')

    const first = acquireView(zero, queries.table(), KEY, '1m')
    const second = acquireView(zero, queries.table(), KEY, '1m')
    const original = first.view.value
    const destroy = vi.spyOn(original, 'destroy')

    first.retry()

    expect(destroy).toHaveBeenCalledTimes(1)
    expect(materialize).toHaveBeenCalledTimes(2)
    expect(first.view.value).not.toBe(original)
    expect(second.view.value).toBe(first.view.value)

    first.release()
    second.release()
  })

  it('tracks the longest requested ttl', () => {
    const zero = withZero()

    const first = acquireView(zero, queries.table(), KEY, '1m')
    const updateTTL = vi.spyOn(first.view.value, 'updateTTL')

    const second = acquireView(zero, queries.table(), KEY, '30s')
    expect(updateTTL).not.toHaveBeenCalled()

    const third = acquireView(zero, queries.table(), KEY, 'forever')
    expect(updateTTL).toHaveBeenLastCalledWith('forever')

    third.release()
    expect(updateTTL).toHaveBeenLastCalledWith('1m')

    second.setTTL('10m')
    expect(updateTTL).toHaveBeenLastCalledWith('10m')

    first.release()
    second.release()
  })

  it('ignores operations after release', () => {
    const zero = withZero()
    const handle = acquireView(zero, queries.table(), KEY, '1m')
    const view = handle.view.value

    handle.release()
    handle.release()
    handle.setTTL('10m')
    handle.retry()

    expect(handle.view.value).toBe(view)
    expect(activeViewCountForTesting(zero)).toBe(0)
  })
})
