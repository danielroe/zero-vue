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
import z from 'zod'

export const schema = createSchema({
  tables: [
    table('table')
      .columns({
        a: number(),
        b: string(),
      })
      .primaryKey('a'),
  ],
})

const defineMutators = defineMutatorsWithType<typeof schema>()
const defineMutator = defineMutatorWithType<typeof schema>()

export const mutators = defineMutators({
  table: {
    insert: defineMutator(
      z.object({ a: z.number(), b: z.string() }),
      async ({ tx, args: { a, b } }) => {
        return tx.mutate.table.insert({ a, b })
      },
    ),
  },
})

const zql = createBuilder(schema)
const defineQueries = defineQueriesWithType<typeof schema>()

export const queries = defineQueries({
  table: defineQuery(() => zql.table),
  byId: defineQuery(
    z.number(),
    ({ args: a }) => zql.table.where('a', a),
  ),
})

export function zeroOptions() {
  return {
    userID: 'test-user',
    server: null,
    schema,
    mutators,
    kvStore: 'mem',
  } as const
}

export function createTestZero() {
  return new Zero(zeroOptions())
}
