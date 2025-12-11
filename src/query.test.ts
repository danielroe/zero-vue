import type { TTL } from '@rocicorp/zero'
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
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { nextTick, ref, watchEffect } from 'vue'
import z from 'zod'
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

  const crud = createCRUDBuilder(schema)
  const defineMutators = defineMutatorsWithType<typeof schema>()
  const mutators = defineMutators({
    table: {
      insert: defineMutator(
        z.object({ a: z.number(), b: z.string() }),
        async ({ tx, args: { a, b } }) => {
          return tx.mutate(crud.table.insert({ a, b }))
        },
      ),
      update: defineMutator(
        z.object({ a: z.number(), b: z.string() }),
        async ({ tx, args: { a, b } }) => {
          return tx.mutate(crud.table.update({ a, b }))
        },
      ),
    },
  })

  const { useZero, useQuery } = createZeroComposables(() => ({
    userID: userID.value,
    server: null,
    schema,
    mutators,
    kvStore: 'mem',
  }))

  const zero = useZero()
  await zero.value.mutate(mutators.table.insert({ a: 1, b: 'a' })).client
  await zero.value.mutate(mutators.table.insert({ a: 2, b: 'b' })).client

  const zql = createBuilder(schema)
  const defineQueries = defineQueriesWithType<typeof schema>()
  const queries = defineQueries({
    byId: defineQuery(
      z.number(),
      ({ args: a }) => zql.table.where('a', a),
    ),
    table: defineQuery(
      () => zql.table,
    ),
  })

  onTestFinished(async () => {
    await zero.value.close()
  })

  return { zero, queries, useQuery, mutators, userID }
}

describe('useQuery', () => {
  it('useQuery', async () => {
    const { zero, mutators, queries, useQuery } = await setupTestEnvironment()
    const { data: rows, status } = useQuery(() => queries.table())
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

    await zero.value.mutate(mutators.table.insert({ a: 3, b: 'c' })).client
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
  })

  it('useQuery with ttl', async () => {
    const { zero, queries, useQuery } = await setupTestEnvironment()

    const ttl = ref<TTL>('1m')

    const materializeSpy = vi.spyOn(zero.value, 'materialize')
    const queryGetter = vi.fn(() => queries.table())

    useQuery(queryGetter, () => ({ ttl: ttl.value }))
    expect(queryGetter).toHaveBeenCalledTimes(1)

    expect(materializeSpy).toHaveLastReturnedWith(expect.any(VueView))
    expect(materializeSpy).toHaveBeenCalledExactlyOnceWith(
      expect.any(Object),
      vueViewFactory,
      { ttl: '1m' },
    )
    expect(materializeSpy.mock.calls[0]![0]).toMatchInlineSnapshot(`
      QueryImpl {
        "_exists": [Function],
        "customQueryID": {
          "args": [],
          "name": "table",
        },
        "format": {
          "relationships": {},
          "singular": false,
        },
        "limit": [Function],
        "one": [Function],
        "orderBy": [Function],
        "related": [Function],
        "start": [Function],
        "where": [Function],
        "whereExists": [Function],
        Symbol(): true,
      }
    `)

    const view: VueView = materializeSpy.mock.results[0]!.value
    const updateTTLSpy = vi.spyOn(view, 'updateTTL')

    materializeSpy.mockClear()

    ttl.value = '10m'
    await nextTick()

    expect(materializeSpy).toHaveBeenCalledTimes(0)
    expect(updateTTLSpy).toHaveBeenCalledExactlyOnceWith('10m')
  })

  it('useQuery deps change', async () => {
    const { queries, useQuery } = await setupTestEnvironment()

    const a = ref(1)

    const { data: rows, status } = useQuery(() =>
      queries.byId(a.value),
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
  })

  it('useQuery deps change watchEffect', async () => {
    const { zero, queries, mutators, useQuery } = await setupTestEnvironment()
    const a = ref(1)
    const { data: rows } = useQuery(() => queries.byId(a.value))

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
          zero.value.mutate(mutators.table.update({ a: 1, b: 'a2' }))
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
  })

  it('can still be used without createZero', async () => {
    const crud = createCRUDBuilder(schema)
    const defineMutators = defineMutatorsWithType<typeof schema>()
    const mutators = defineMutators({
      table: {
        insert: defineMutator(
          z.object({ a: z.number(), b: z.string() }),
          async ({ tx, args: { a, b } }) => {
            return tx.mutate(crud.table.insert({ a, b }))
          },
        ),
      },
    })
    const zero = new Zero({
      userID: 'test-user',
      server: null,
      schema,
      mutators,
      kvStore: 'mem' as const,
    })
    await zero.mutate(mutators.table.insert({ a: 1, b: 'a' })).client
    await zero.mutate(mutators.table.insert({ a: 2, b: 'b' })).client

    const zql = createBuilder(schema)
    const defineQueries = defineQueriesWithType<typeof schema>()
    const queries = defineQueries({
      table: defineQuery(
        () => zql.table,
      ),
    })

    const { data: rows, status } = useQuery(zero, () => queries.table())
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

    await zero.close()
  })
})
