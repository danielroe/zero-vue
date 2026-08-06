import type { TTL } from '@rocicorp/zero'
import {
  createBuilder,
  createSchema,
  defineMutatorsWithType,
  defineMutatorWithType,
  defineQueriesWithType,
  defineQuery,
  number,
  relationships,
  string,
  table,
  Zero,
} from '@rocicorp/zero'
import { asQueryInternals } from '@rocicorp/zero/bindings'
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

  const defineMutators = defineMutatorsWithType<typeof schema>()
  const defineMutator = defineMutatorWithType<typeof schema>()
  const mutators = defineMutators({
    table: {
      insert: defineMutator(
        z.object({ a: z.number(), b: z.string() }),
        async ({ tx, args: { a, b } }) => {
          return tx.mutate.table.insert({ a, b })
        },
      ),
      update: defineMutator(
        z.object({ a: z.number(), b: z.string() }),
        async ({ tx, args: { a, b } }) => {
          return tx.mutate.table.update({ a, b })
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

  it('useQuery supports disabled maybe queries', async () => {
    const { zero, queries, useQuery } = await setupTestEnvironment()
    const enabled = ref(false)
    const materializeSpy = vi.spyOn(zero.value, 'materialize')

    const { data: rows, status } = useQuery(() => enabled.value && queries.table())

    expect(rows.value).toBeUndefined()
    expect(status.value).toBe('disabled')
    expect(materializeSpy).not.toHaveBeenCalled()

    enabled.value = true
    await nextTick()

    expect(materializeSpy).toHaveBeenCalledTimes(1)
    expect(rows.value).toMatchInlineSnapshot(`
[
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
]
`)
    expect(status.value).toEqual('unknown')

    const view: VueView = materializeSpy.mock.results[0]!.value
    const destroySpy = vi.spyOn(view, 'destroy')

    enabled.value = false
    await nextTick()

    expect(destroySpy).toHaveBeenCalledTimes(1)
    expect(rows.value).toBeUndefined()
    expect(status.value).toBe('disabled')
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

  it('re-materializes when query format changes', async () => {
    const { zero, useQuery } = await setupTestEnvironment()
    const zql = createBuilder(schema)
    const pluralQuery = zql.table.where('a', 1).limit(1)
    const singularQuery = zql.table.where('a', 1).one()
    expect(asQueryInternals(pluralQuery).hash()).toBe(asQueryInternals(singularQuery).hash())

    const singular = ref(false)
    const materializeSpy = vi.spyOn(zero.value, 'materialize')
    const query = () => singular.value
      ? singularQuery
      : pluralQuery

    useQuery(query as Parameters<typeof useQuery>[0])

    expect(materializeSpy).toHaveBeenCalledTimes(1)

    singular.value = true
    await nextTick()

    expect(materializeSpy).toHaveBeenCalledTimes(2)
  })

  it('re-materializes when nested query format changes', async () => {
    const issue = table('issue')
      .columns({ id: string() })
      .primaryKey('id')
    const comment = table('comment')
      .columns({ id: string(), issueID: string() })
      .primaryKey('id')
    const nestedSchema = createSchema({
      tables: [issue, comment],
      relationships: [
        relationships(issue, ({ many }) => ({
          comments: many({
            sourceField: ['id'],
            destField: ['issueID'],
            destSchema: comment,
          }),
        })),
      ],
    })
    const zero = new Zero({
      userID: 'test-user',
      server: null,
      schema: nestedSchema,
      kvStore: 'mem' as const,
    })
    const zql = createBuilder(nestedSchema)
    const pluralQuery = zql.issue
      .where('id', 'i1')
      .related('comments', q => q.limit(1))
    const singularQuery = zql.issue
      .where('id', 'i1')
      .related('comments', q => q.one())
    expect(asQueryInternals(pluralQuery).hash()).toBe(asQueryInternals(singularQuery).hash())

    onTestFinished(async () => {
      await zero.close()
    })

    const singular = ref(false)
    const materializeSpy = vi.spyOn(zero, 'materialize')
    const query = () => singular.value
      ? singularQuery
      : pluralQuery

    useQuery(zero, query as never)

    expect(materializeSpy).toHaveBeenCalledTimes(1)

    singular.value = true
    await nextTick()

    expect(materializeSpy).toHaveBeenCalledTimes(2)
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
    const defineMutators = defineMutatorsWithType<typeof schema>()
    const defineMutator = defineMutatorWithType<typeof schema>()
    const mutators = defineMutators({
      table: {
        insert: defineMutator(
          z.object({ a: z.number(), b: z.string() }),
          async ({ tx, args: { a, b } }) => {
            return tx.mutate.table.insert({ a, b })
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
  })

  it('still works with legacy queries', async () => {
    const schema = createSchema({
      tables: [
        table('table')
          .columns({
            a: number(),
            b: string(),
          })
          .primaryKey('a'),
      ],
      enableLegacyQueries: true,
      enableLegacyMutators: true,
    })

    const zero = new Zero({
      userID: 'test-user',
      server: null,
      schema,
      kvStore: 'mem' as const,
    })

    const { data } = useQuery(zero, zero.query.table)
    expect(data.value).toEqual([])

    await zero.mutate.table.insert({ a: 1, b: 'a2' })

    expect(data.value).toMatchInlineSnapshot(`
      [
        {
          "a": 1,
          "b": "a2",
          Symbol(rc): 1,
        },
      ]
    `)
  })
})
