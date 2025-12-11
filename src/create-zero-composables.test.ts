import {
  createBuilder,
  createCRUDBuilder,
  createSchema,
  defineMutator,
  defineMutatorsWithType,
  defineQueriesWithType,
  defineQuery,
  number,
  string,
  table,
  Zero,
} from '@rocicorp/zero'
import { assert, describe, expect, it } from 'vitest'
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

    // const oldZero = zero.value

    userID.value = 'test-user-2'
    await nextTick()

    expect(zero.value.userID).toEqual('test-user-2')
    expect(zero.value.closed).toBe(false)

    // TODO: Figure out a way to test this, since closing is async
    // expect(oldZero.closed).toBe(true)
  })

  it('useQuery works whithout explicitly calling useZero', async () => {
    const crud = createCRUDBuilder(testSchema)
    const defineMutators = defineMutatorsWithType<typeof testSchema>()
    const mutators = defineMutators({
      test: {
        insert: defineMutator(
          z.object({ id: z.number(), name: z.string() }),
          async ({ tx, args: { id, name } }) => {
            return tx.mutate(crud.test.insert({ id, name }))
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

    // const oldZero = usedZero.value

    userID.value = 'test-user-2'
    await nextTick()

    expect(usedZero.value.userID).toEqual('test-user-2')
    expect(usedZero.value.closed).toBe(false)

    // TODO: Figure out a way to test this, since closing is async
    // expect(oldZero.closed).toBe(true)
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
