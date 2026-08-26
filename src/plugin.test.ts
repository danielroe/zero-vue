// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { createApp, effectScope } from 'vue'
import { mutators, queries, zeroOptions } from '../test/fixture'
import { useConnectionState } from './connection'
import { useMutation } from './mutation'
import { createZeroPlugin } from './plugin'
import { useQuery } from './query'

function createTestApp() {
  const zero = createZeroPlugin(zeroOptions())
  const app = createApp({ render: () => null })
  app.use(zero)
  return { app, zero }
}

describe('createZeroPlugin', () => {
  it('provides the composables to the app', () => {
    const { app, zero } = createTestApp()

    app.runWithContext(() => {
      const scope = effectScope()
      scope.run(() => {
        const { data, status } = useQuery(() => queries.table())
        expect(data.value).toEqual([])
        expect(status.value).not.toBe('disabled')
        expect(useConnectionState().value).toBeDefined()
      })
      scope.stop()
    })

    zero.dispose()
  })

  it('exposes the bundle directly as well as through injection', () => {
    const { app, zero } = createTestApp()

    expect(zero.useZero().value.userID).toBe('test-user')
    app.runWithContext(() => {
      expect(useQuery(() => queries.table()).data.value).toEqual([])
    })

    zero.dispose()
  })

  it('disposes the composables when the app unmounts', async () => {
    const { app, zero } = createTestApp()

    const instance = zero.useZero().value
    app.mount(document.createElement('div'))
    app.unmount()
    await new Promise(resolve => setTimeout(resolve, 1))

    expect(instance.closed).toBe(true)
  })

  it('throws a helpful error when a query getter returns a Zero instance', () => {
    const { app, zero } = createTestApp()

    app.runWithContext(() => {
      expect(() => useQuery(() => zero.useZero().value as never)).toThrow(/Pass the instance/)
    })

    zero.dispose()
  })

  it('resolves the instance for mutations too', async () => {
    const { app, zero } = createTestApp()

    await app.runWithContext(async () => {
      const { mutate, pending, error } = useMutation(mutators.table.insert)
      expect(pending.value).toBe(false)
      const result = mutate({ a: 1, b: 'one' })
      expect(pending.value).toBe(true)
      await result
      expect(pending.value).toBe(false)
      expect(error.value).toBeUndefined()
    })

    zero.dispose()
  })
})
