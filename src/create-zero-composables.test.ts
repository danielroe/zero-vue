import {
  createBuilder,
  createSchema,
  defineMutatorsWithType,
  defineMutatorWithType,
  defineQueriesWithType,
  defineQuery,
  number,
  string,
  table,
  Zero,
} from '@rocicorp/zero'
import { assert, describe, expect, it, vi } from 'vitest'
import { computed, nextTick, ref } from 'vue'
import z from 'zod'
import { createZeroComposables } from './create-zero-composables'

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

describe('createZeroComposables', () => {
  it('creates a zero instance', () => {
    const { useZero } = createZeroComposables({
      userID: 'test-user',
      server: null,
      schema: testSchema,
      kvStore: 'mem' as const,
    })

    const zero = useZero()
    assert(zero.value)
    expect(zero.value.userID).toEqual('test-user')
  })

  it('useConnectionState works', () => {
    const { useConnectionState } = createZeroComposables({
      userID: 'test-user',
      server: null,
      schema: testSchema,
      kvStore: 'mem' as const,
    })

    const connectionState = useConnectionState()
    assert(connectionState.value)
  })

  it('accepts Zero instance instead of options', () => {
    const zero = new Zero({
      userID: 'test-user',
      server: null,
      schema: testSchema,
      kvStore: 'mem' as const,
    })
    const { useZero } = createZeroComposables({ zero })

    const usedZero = useZero()
    assert(usedZero.value)
    expect(usedZero.value).toEqual(zero)
  })

  it('updates when options change', async () => {
    const userID = ref('test-user')
    const zeroOptions = computed(() => ({
      userID: userID.value,
      server: null,
      schema: testSchema,
      kvStore: 'mem' as const,
    }))

    const { useZero } = createZeroComposables(zeroOptions)

    const zero = useZero()
    assert(zero.value)

    expect(zero.value.userID).toEqual('test-user')

    const oldZero = zero.value

    userID.value = 'test-user-2'
    await nextTick()
    await new Promise(resolve => setTimeout(resolve, 1))

    expect(zero.value.userID).toEqual('test-user-2')
    expect(zero.value.closed).toBe(false)
    expect(oldZero.closed).toBe(true)
  })

  it('useQuery works whithout explicitly calling useZero', async () => {
    const defineMutators = defineMutatorsWithType<typeof testSchema>()
    const defineMutator = defineMutatorWithType<typeof testSchema>()
    const mutators = defineMutators({
      test: {
        insert: defineMutator(
          z.object({ id: z.number(), name: z.string() }),
          async ({ tx, args: { id, name } }) => {
            return tx.mutate.test.insert({ id, name })
          },
        ),
      },
    })

    const zero = new Zero({
      userID: 'test-user',
      server: null,
      schema: testSchema,
      mutators,
      kvStore: 'mem' as const,
    })

    await zero.mutate(mutators.test.insert({ id: 1, name: 'test1' })).client
    await zero.mutate(mutators.test.insert({ id: 2, name: 'test2' })).client

    const zql = createBuilder(testSchema)
    const defineQueries = defineQueriesWithType<typeof testSchema>()
    const queries = defineQueries({
      byId: defineQuery(
        z.number(),
        ({ args: id }) => zql.test.where('id', id),
      ),
    })

    const { useQuery } = createZeroComposables({
      zero,
    })

    const { data } = useQuery(() => queries.byId(1))
    expect(data.value).toMatchInlineSnapshot(`
[
  {
    "id": 1,
    "name": "test1",
    Symbol(rc): 1,
  },
]`)
  })

  it('updates when Zero instance changes', async () => {
    const userID = ref('test-user')

    const zero = computed(() => ({ zero: new Zero({
      userID: userID.value,
      server: null,
      schema: testSchema,
      kvStore: 'mem' as const,
    }) }))

    const { useZero } = createZeroComposables(zero)
    const usedZero = useZero()
    assert(usedZero?.value)

    expect(usedZero.value.userID).toEqual('test-user')

    const oldZero = usedZero.value

    userID.value = 'test-user-2'
    await nextTick()
    await new Promise(resolve => setTimeout(resolve, 1))

    expect(usedZero.value.userID).toEqual('test-user-2')
    expect(usedZero.value.closed).toBe(false)
    expect(oldZero.closed).toBe(true)
  })

  it('is created lazily and once', async () => {
    const zero = new Zero({
      userID: 'test-user',
      server: null,
      schema: testSchema,
      kvStore: 'mem' as const,
    })

    let zeroAccessCount = 0
    const accessCountPerCreation = 2

    const proxiedOpts = new Proxy(
      { zero },
      {
        get(target, prop) {
          if (prop === 'zero') {
            zeroAccessCount++
          }
          return target[prop as keyof typeof target]
        },
      },
    )

    const { useZero } = createZeroComposables(proxiedOpts)

    expect(zeroAccessCount).toBe(0)

    useZero()
    expect(zeroAccessCount).toBe(accessCountPerCreation)

    await nextTick()
    expect(zeroAccessCount).toBe(accessCountPerCreation)

    useZero()
    await nextTick()
    expect(zeroAccessCount).toBe(accessCountPerCreation)
  })
})

describe('createZeroComposables lifecycle', () => {
  it('refreshes auth in place instead of recreating the instance', async () => {
    const auth = ref('token-1')
    const { useZero } = createZeroComposables(() => ({
      userID: 'test-user',
      server: null,
      auth: auth.value,
      schema: testSchema,
      kvStore: 'mem' as const,
    }))

    const zero = useZero()
    const instance = zero.value
    const connect = vi.spyOn(instance.connection, 'connect').mockResolvedValue()

    auth.value = 'token-2'
    await nextTick()

    expect(zero.value).toBe(instance)
    expect(instance.closed).toBe(false)
    expect(connect).toHaveBeenCalledExactlyOnceWith({ auth: 'token-2' })
  })

  it('recreates the instance when signing out', async () => {
    const auth = ref<string | undefined>('token-1')
    const { useZero } = createZeroComposables(() => ({
      userID: 'test-user',
      server: null,
      auth: auth.value,
      schema: testSchema,
      kvStore: 'mem' as const,
    }))

    const zero = useZero()
    const instance = zero.value

    auth.value = undefined
    await nextTick()

    expect(zero.value).not.toBe(instance)
  })

  it('recreates the instance when another option changes alongside auth', async () => {
    const auth = ref('token-1')
    const userID = ref('test-user')
    const { useZero } = createZeroComposables(() => ({
      userID: userID.value,
      server: null,
      auth: auth.value,
      schema: testSchema,
      kvStore: 'mem' as const,
    }))

    const zero = useZero()
    const instance = zero.value

    auth.value = 'token-2'
    userID.value = 'other-user'
    await nextTick()

    expect(zero.value).not.toBe(instance)
    expect(zero.value.userID).toBe('other-user')
  })

  it('unsubscribes from the previous connection state when the instance changes', async () => {
    const userID = ref('test-user')
    const { useZero, useConnectionState } = createZeroComposables(() => ({
      userID: userID.value,
      server: null,
      schema: testSchema,
      kvStore: 'mem' as const,
    }))

    const zero = useZero()
    const unsubscribe = vi.fn()
    const subscribe = vi.spyOn(zero.value.connection.state, 'subscribe').mockReturnValue(unsubscribe)

    useConnectionState()
    expect(subscribe).toHaveBeenCalledTimes(1)

    userID.value = 'test-user-2'
    await nextTick()

    expect(unsubscribe).toHaveBeenCalledTimes(1)
  })

  it('dispose closes the instance and stops watching the options', async () => {
    const userID = ref('test-user')
    const composables = createZeroComposables(() => ({
      userID: userID.value,
      server: null,
      schema: testSchema,
      kvStore: 'mem' as const,
    }))

    const zero = composables.useZero()
    const instance = zero.value

    composables.dispose()
    await new Promise(resolve => setTimeout(resolve, 1))

    expect(instance.closed).toBe(true)

    userID.value = 'test-user-2'
    await nextTick()

    expect(zero.value).toBe(instance)
  })

  it('dispose is idempotent', () => {
    const composables = createZeroComposables({
      userID: 'test-user',
      server: null,
      schema: testSchema,
      kvStore: 'mem' as const,
    })
    composables.useZero()
    composables.dispose()
    expect(() => composables.dispose()).not.toThrow()
  })
})
