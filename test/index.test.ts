import { createSchema, string, table } from '@rocicorp/zero'
import { describe, expect, it } from 'vitest'
import { createZeroComposables } from '../src'

describe('zero-vue', () => {
  it('works', async () => {
    const user = table('user')
      .columns({
        id: string(),
        name: string(),
      })
      .primaryKey('id')

    const schema = createSchema({
      tables: [user],
    })

    const { useZero, useQuery } = createZeroComposables(() => ({
      userID: 'asdf',
      server: null,
      schema,
      // This is often easier to develop with if you're frequently changing
      // the schema. Switch to 'idb' for local-persistence.
      kvStore: 'mem',
    }))
    const z = useZero()

    const { data: users } = useQuery(z.value.query.user)

    expect(users.value).toEqual([])

    const mutation = z.value.mutate.user.insert({ id: 'asdf', name: 'Alice' })

    expect(users.value).toEqual([])

    await mutation

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
