import { createBuilder, createSchema, number, string, syncedQuery, table, Zero } from '@rocicorp/zero'
import { assert, describe, expect, it } from 'vitest'
import { computed, nextTick, ref } from 'vue'
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

    const oldZero = zero.value

    userID.value = 'test-user-2'
    await nextTick()

    expect(zero.value.userID).toEqual('test-user-2')
    expect(zero.value.closed).toBe(false)
    expect(oldZero.closed).toBe(true)
  })

  it('useQuery works whithout explicitly calling useZero', async () => {
    const zero = new Zero({
      userID: 'test-user',
      server: null,
      schema: testSchema,
      kvStore: 'mem' as const,
    })

    await zero.mutate.test.insert({ id: 1, name: 'test1' })
    await zero.mutate.test.insert({ id: 2, name: 'test2' })

    const builder = createBuilder(testSchema)
    const byIdQuery = syncedQuery(
      'byId',
      ([id]) => {
        if (typeof id !== 'number') {
          throw new TypeError('id must be a number')
        }
        return [id] as const
      },
      (id: number) => {
        return builder.test.where('id', id)
      },
    )

    const { useQuery } = createZeroComposables({
      zero,
    })

    const { data } = useQuery(() => byIdQuery(1))
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
