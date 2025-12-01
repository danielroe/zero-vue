import type { TTL } from '@rocicorp/zero'
import { createBuilder, createSchema, number, string, syncedQuery, table, Zero } from '@rocicorp/zero'
import { describe, expect, it, vi } from 'vitest'
import { nextTick, ref, watchEffect } from 'vue'
import { createZeroComposables } from './create-zero-composables'
import { useQuery } from './query'
import { VueView, vueViewFactory } from './view'

const schema = createSchema({
  tables: [
    table('table')
      .columns({
        a: number(),
        b: string(),
      })
      .primaryKey('a'),
  ],
})

async function setupTestEnvironment() {
  const userID = ref('asdf')

  const { useZero, useQuery } = createZeroComposables(() => ({
    userID: userID.value,
    server: null,
    schema,
    kvStore: 'mem',
  }))

  const z = useZero()
  await z.value.mutate.table.insert({ a: 1, b: 'a' })
  await z.value.mutate.table.insert({ a: 2, b: 'b' })

  const builder = createBuilder(schema)
  const byIdQuery = syncedQuery
    ? syncedQuery(
        'byId',
        ([id]) => {
          if (typeof id !== 'number') {
            throw new TypeError('id must be a number')
          }
          return [id] as const
        },
        (id: number) => {
          return builder.table.where('a', id)
        },
      )
    : undefined

  const tableQuery = z!.value.query.table

  return { z, tableQuery, useQuery, byIdQuery, userID }
}

describe('useQuery', () => {
  it('useQuery', async () => {
    const { z, tableQuery, useQuery } = await setupTestEnvironment()
    const { data: rows, status } = useQuery(() => tableQuery)
    expect(rows.value).toMatchInlineSnapshot(`[
  {
    "a": 1,
    "b": "a",
    Symbol(rc): 1,
  },
  {
    "a": 2,
    "b": "b",
    Symbol(rc): 1,
  },
]`)
    expect(status.value).toEqual('unknown')

    await z.value.mutate.table.insert({ a: 3, b: 'c' })
    await nextTick()

    expect(rows.value).toMatchInlineSnapshot(`[
  {
    "a": 1,
    "b": "a",
    Symbol(rc): 1,
  },
  {
    "a": 2,
    "b": "b",
    Symbol(rc): 1,
  },
  {
    "a": 3,
    "b": "c",
    Symbol(rc): 1,
  },
]`)

    // TODO: this is not working at the moment, possibly because we don't have a server connection in test
    // expect(resultType.value).toEqual("complete");

    z.value.close()
  })

  it('useQuery with ttl', async () => {
    const { z, tableQuery, useQuery } = await setupTestEnvironment()

    const ttl = ref<TTL>('1m')

    const materializeSpy = vi.spyOn(z.value, 'materialize')
    const queryGetter = vi.fn(() => tableQuery)

    useQuery(queryGetter, () => ({ ttl: ttl.value }))
    expect(queryGetter).toHaveBeenCalledTimes(1)

    expect(materializeSpy).toHaveLastReturnedWith(expect.any(VueView))
    expect(materializeSpy).toHaveBeenCalledExactlyOnceWith(
      tableQuery,
      vueViewFactory,
      { ttl: '1m' },
    )

    const view: VueView<unknown> = materializeSpy.mock.results[0]!.value
    const updateTTLSpy = vi.spyOn(view, 'updateTTL')

    materializeSpy.mockClear()

    ttl.value = '10m'
    await nextTick()

    expect(materializeSpy).toHaveBeenCalledTimes(0)
    expect(updateTTLSpy).toHaveBeenCalledExactlyOnceWith('10m')

    z.value.close()
  })

  it('useQuery deps change', async () => {
    const { z, tableQuery, useQuery } = await setupTestEnvironment()

    const a = ref(1)

    const { data: rows, status } = useQuery(() =>
      tableQuery.where('a', a.value),
    )

    const rowLog: unknown[] = []
    const resultDetailsLog: unknown[] = []
    const resetLogs = () => {
      rowLog.length = 0
      resultDetailsLog.length = 0
    }

    watchEffect(() => {
      rowLog.push(rows.value)
    })

    watchEffect(() => {
      resultDetailsLog.push(status.value)
    })

    expect(rowLog).toMatchInlineSnapshot(`[
  [
    {
      "a": 1,
      "b": "a",
      Symbol(rc): 1,
    },
  ],
]`)
    // expect(resultDetailsLog).toEqual(['unknown'])
    resetLogs()

    expect(rowLog).toEqual([])
    // expect(resultDetailsLog).toEqual(['complete'])
    resetLogs()

    a.value = 2
    await nextTick()

    expect(rowLog).toMatchInlineSnapshot(`[
  [
    {
      "a": 2,
      "b": "b",
      Symbol(rc): 1,
    },
  ],
]`)
    // expect(resultDetailsLog).toEqual(["unknown"]);
    resetLogs()

    expect(rowLog).toEqual([])
    // expect(resultDetailsLog).toEqual(["complete"]);

    z.value.close()
  })

  it('useQuery deps change watchEffect', async () => {
    const { z, tableQuery, useQuery } = await setupTestEnvironment()
    const a = ref(1)
    const { data: rows } = useQuery(() => tableQuery.where('a', a.value))

    let run = 0

    await new Promise((resolve) => {
      watchEffect(() => {
        if (run === 0) {
          expect(rows.value).toMatchInlineSnapshot(
            `[
  {
    "a": 1,
    "b": "a",
    Symbol(rc): 1,
  },
]`,
          )
          z.value.mutate.table.update({ a: 1, b: 'a2' })
        }
        else if (run === 1) {
          expect(rows.value).toMatchInlineSnapshot(
            `[
  {
    "a": 1,
    "b": "a2",
    Symbol(rc): 1,
  },
]`,
          )
          a.value = 2
        }
        else if (run === 2) {
          expect(rows.value).toMatchInlineSnapshot(
            `[
  {
    "a": 2,
    "b": "b",
    Symbol(rc): 1,
  },
]`,
          )
          resolve(true)
        }
        run++
      })
    })

    z.value.close()
  })

  it('useQuery with syncedQuery', async () => {
    const { z, byIdQuery, useQuery } = await setupTestEnvironment()
    if (!byIdQuery) {
      return
    }

    const a = ref(1)
    const { data: rows, status } = useQuery(() => byIdQuery(a.value))

    expect(rows.value).toMatchInlineSnapshot(`
[
  {
    "a": 1,
    "b": "a",
    Symbol(rc): 1,
  },
]`)
    expect(status.value).toEqual('unknown')

    z.value.close()
  })

  it('can still be used without createZero', async () => {
    const z = new Zero({
      userID: 'test-user',
      server: null,
      schema,
      kvStore: 'mem' as const,
    })
    await z.mutate.table.insert({ a: 1, b: 'a' })
    await z.mutate.table.insert({ a: 2, b: 'b' })

    const { data: rows, status } = useQuery(z, () => z.query.table)
    expect(rows.value).toMatchInlineSnapshot(`[
  {
    "a": 1,
    "b": "a",
    Symbol(rc): 1,
  },
  {
    "a": 2,
    "b": "b",
    Symbol(rc): 1,
  },
]`)
    expect(status.value).toEqual('unknown')

    z.close()
  })
})
