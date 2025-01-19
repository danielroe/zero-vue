import { createSchema, createTableSchema, Zero } from '@rocicorp/zero'
import { describe, expect, it } from 'vitest'

import { useQuery } from '../src/index'

describe('zero-vue', () => {
  it('works', async () => {
    const schema = createSchema({
      version: 1,
      tables: {
        user: createTableSchema({
          tableName: 'user',
          columns: {
            id: 'string',
            name: 'string',
          },
          primaryKey: 'id',
        }),
      },
    })

    const z = new Zero({
      userID: 'asdf',
      server: null,
      schema,
      // This is often easier to develop with if you're frequently changing
      // the schema. Switch to 'idb' for local-persistence.
      kvStore: 'mem',
    })

    const { data: users } = useQuery(z.query.user)

    expect(users.value).toEqual([])

    z.mutate.user.insert({ id: 'asdf', name: 'Alice' })

    expect(users.value).toEqual([])
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(users.value).toEqual([{ id: 'asdf', name: 'Alice' }])
  })
})
