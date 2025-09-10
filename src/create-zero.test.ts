import { createSchema, number, string, table, Zero } from '@rocicorp/zero'
import { assert, describe, expect, it } from 'vitest'
import { computed, createApp, inject, ref } from 'vue'
import { createZero, zeroSymbol } from './create-zero'

const testSchema = createSchema({
  tables: [
    table('test')
      .columns({
        id: number(),
        name: string(),
      })
      .primaryKey('id'),
  ],
})

describe('createZero', () => {
  it('installs and provides zero instance to Vue app', () => {
    const app = createApp({})
    app.use(createZero({
      userID: 'test-user',
      server: null,
      schema: testSchema,
      kvStore: 'mem' as const,
    }))

    app.runWithContext(() => {
      const zero = inject(zeroSymbol)
      assert(zero?.value)
      expect(zero?.value.userID).toEqual('test-user')
    })
  })

  it('accepts Zero instance instead of options', () => {
    const app = createApp({})
    const zero = new Zero({
      userID: 'test-user',
      server: null,
      schema: testSchema,
      kvStore: 'mem' as const,
    })
    app.use(createZero({ zero }))

    app.runWithContext(() => {
      const injectedZero = inject(zeroSymbol)
      assert(injectedZero?.value)
      expect(injectedZero.value).toEqual(zero)
    })
  })

  it('updates when options change', async () => {
    const app = createApp({})
    const userID = ref('test-user')
    const zeroOptions = computed(() => ({
      userID: userID.value,
      server: null,
      schema: testSchema,
      kvStore: 'mem' as const,
    }))

    app.use(createZero(zeroOptions))

    await app.runWithContext(async () => {
      const injectedZero = inject(zeroSymbol)
      assert(injectedZero?.value)

      expect(injectedZero.value.userID).toEqual('test-user')

      const oldZero = injectedZero.value

      userID.value = 'test-user-2'
      await 1

      expect(injectedZero.value.userID).toEqual('test-user-2')
      expect(injectedZero.value.closed).toBe(false)
      expect(oldZero.closed).toBe(true)
    })
  })

  it('updates when Zero instance changes', async () => {
    const app = createApp({})
    const userID = ref('test-user')

    const zero = computed(() => ({ zero: new Zero({
      userID: userID.value,
      server: null,
      schema: testSchema,
      kvStore: 'mem' as const,
    }) }))

    app.use(createZero(zero))

    await app.runWithContext(async () => {
      const injectedZero = inject(zeroSymbol)
      assert(injectedZero?.value)

      expect(injectedZero.value.userID).toEqual('test-user')

      const oldZero = injectedZero.value

      userID.value = 'test-user-2'
      await 1

      expect(injectedZero.value.userID).toEqual('test-user-2')
      expect(injectedZero.value.closed).toBe(false)
      expect(oldZero.closed).toBe(true)
    })
  })
})
