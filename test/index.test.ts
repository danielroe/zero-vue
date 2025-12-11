import {
  createBuilder,
  createCRUDBuilder,
  createSchema,
  defineMutator,
  defineMutatorsWithType,
  defineQueriesWithType,
  defineQuery,
  string,
  table,
} from '@rocicorp/zero'
import { describe, expect, it } from 'vitest'
import z from 'zod'
import { createZeroComposables } from '../src'

const user = table('user')
  .columns({
    id: string(),
    name: string(),
  })
  .primaryKey('id')

const schema = createSchema({
  tables: [user],
})

describe('zero-vue', () => {
  it('works', async () => {
    const crud = createCRUDBuilder(schema)
    const defineMutators = defineMutatorsWithType<typeof schema>()
    const mutators = defineMutators({
      insert: defineMutator(
        z.object({ id: z.string(), name: z.string() }),
        async ({ tx, args: { id, name } }) => {
          return tx.mutate(crud.user.insert({ id, name }))
        },
      ),
    })

    const { useZero, useQuery } = createZeroComposables(() => ({
      userID: 'asdf',
      server: null,
      schema,
      mutators,
      // This is often easier to develop with if you're frequently changing
      // the schema. Switch to 'idb' for local-persistence.
      kvStore: 'mem',
    }))
    const zero = useZero()

    const zql = createBuilder(schema)
    const defineQueries = defineQueriesWithType<typeof schema>()
    const queries = defineQueries({
      user: defineQuery(() => zql.user),
    })

    const { data: users } = useQuery(queries.user())

    expect(users.value).toEqual([])

    const mutation = zero.value.mutate(mutators.insert({ id: 'asdf', name: 'Alice' }))

    expect(users.value).toEqual([])

    await mutation.client

    expect(users.value).toMatchInlineSnapshot(`
        [
          {
            "id": "asdf",
            "name": "Alice",
            Symbol(rc): 1,
          },
        ]
    `)
  })
})
