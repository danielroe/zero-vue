import type { TTL } from '@rocicorp/zero'
import type { MockInstance } from 'vitest'
import type { ShallowRef } from 'vue'
import { createBuilder, createSchema, number, string, syncedQuery, table, Zero } from '@rocicorp/zero'
import { describe, expect, it, vi } from 'vitest'
import { computed, createApp, inject, onMounted, ref, shallowRef, watchEffect } from 'vue'
import { createUseZero } from './create-use-zero'
import { createZero, zeroSymbol } from './create-zero'
import { useQuery } from './query'
import { VueView, vueViewFactory } from './view'

export function withSetup<T>(composable: () => T) {
  const result = shallowRef<T>()
  const app = createApp({
    setup() {
      onMounted(() => {
        result.value = composable()
      })

      return () => {}
    },
  })
  return [result, app] as const
}

async function setupTestEnvironment(registerPlugin = true) {
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

  let zero: ShallowRef<ShallowRef<Zero<typeof schema> | undefined> | undefined | void>

  const userID = ref('asdf')
  const useZero = createUseZero<typeof schema>()

  const setupResult = withSetup(registerPlugin ? useZero : () => {})
  if (setupResult[0]) {
    zero = setupResult[0]
  }
  const app = setupResult[1]

  if (registerPlugin) {
    app.use(createZero(() => ({
      userID: userID.value,
      server: null,
      schema,
      kvStore: 'mem',
    })))
  }
  app.mount(document.createElement('div'))

  const z = computed(() => {
    if (zero?.value) {
      return zero.value!.value!
    }

    return new Zero({ userID: 'asdf', server: null, schema, kvStore: 'mem' })
  })

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

  return { z, tableQuery, byIdQuery, app, userID }
}

describe('useQuery', () => {
  it('useQuery', async () => {
    const { z, tableQuery, app } = await setupTestEnvironment()
    await app.runWithContext(async () => {
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
      await 1

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
  })

  it('useQuery with ttl (zero@0.18)', async () => {
    const { z, tableQuery, app } = await setupTestEnvironment()
    if (!('updateTTL' in tableQuery)) {
      // 0.19 removed updateTTL from the query
      return
    }

    await app.runWithContext(async () => {
      const ttl = ref<TTL>('1m')

      const materializeSpy = vi.spyOn(tableQuery, 'materialize')
      // @ts-expect-error missing from v0.19+
      const updateTTLSpy = vi.spyOn(tableQuery, 'updateTTL')
      const queryGetter = vi.fn(() => tableQuery)

      useQuery(queryGetter, () => ({ ttl: ttl.value }))

      expect(queryGetter).toHaveBeenCalledTimes(1)
      expect(updateTTLSpy).toHaveBeenCalledTimes(0)
      expect(materializeSpy).toHaveBeenCalledExactlyOnceWith(
        vueViewFactory,
        '1m',
      )
      materializeSpy.mockClear()

      ttl.value = '10m'
      await 1

      expect(materializeSpy).toHaveBeenCalledTimes(0)
      expect(updateTTLSpy).toHaveBeenCalledExactlyOnceWith('10m')

      z.value.close()
    })
  })

  it('useQuery with ttl (zero@0.19)', async () => {
    const { z, tableQuery, app } = await setupTestEnvironment()
    if ('updateTTL' in tableQuery) {
      // 0.19 removed updateTTL from the query
      return
    }

    await app.runWithContext(async () => {
      const ttl = ref<TTL>('1m')

      let materializeSpy: MockInstance
      // @ts-expect-error only present in v0.23+
      if (z.value.materialize) {
        materializeSpy = vi.spyOn(z.value, 'materialize')
      }
      else {
        materializeSpy = vi.spyOn(tableQuery, 'materialize')
      }

      const queryGetter = vi.fn(() => tableQuery)

      useQuery(queryGetter, () => ({ ttl: ttl.value }))
      expect(queryGetter).toHaveBeenCalledTimes(1)

      expect(materializeSpy).toHaveLastReturnedWith(expect.any(VueView))
      // @ts-expect-error only present in v0.23+
      if (z.value.materialize) {
        expect(materializeSpy).toHaveBeenCalledExactlyOnceWith(
          tableQuery,
          vueViewFactory,
          { ttl: '1m' },
        )
      }
      else {
        expect(materializeSpy).toHaveBeenCalledExactlyOnceWith(
          vueViewFactory,
          '1m',
        )
      }

      const view: VueView<unknown> = materializeSpy.mock.results[0]!.value
      const updateTTLSpy = vi.spyOn(view, 'updateTTL')

      materializeSpy.mockClear()

      ttl.value = '10m'
      await 1

      expect(materializeSpy).toHaveBeenCalledTimes(0)
      expect(updateTTLSpy).toHaveBeenCalledExactlyOnceWith('10m')

      z.value.close()
    })
  })

  it('useQuery deps change', async () => {
    const { z, tableQuery, app } = await setupTestEnvironment()

    await app.runWithContext(async () => {
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
      // expect(resultDetailsLog).toEqual(["unknown"]);
      resetLogs()

      expect(rowLog).toEqual([])
      // expect(resultDetailsLog).toEqual(["complete"]);
      resetLogs()

      a.value = 2
      await 1

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
  })

  it('useQuery deps change watchEffect', async () => {
    const { z, tableQuery, app } = await setupTestEnvironment()
    await app.runWithContext(async () => {
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
  })

  it('useQuery with syncedQuery', async () => {
    const { z, byIdQuery, app } = await setupTestEnvironment()
    if (!byIdQuery) {
      return
    }

    app.runWithContext(() => {
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
  })

  it('useQuery can be used without plugin (will be dropped in future versions)', async () => {
    const { z, tableQuery, app } = await setupTestEnvironment(false)

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

    app.runWithContext(() => {
      if (zeroSymbol) {
        expect(inject(zeroSymbol, null)).toBeNull()
      }
    })

    z.value.close()
  })
})
