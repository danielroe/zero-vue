import { mustGetQuery } from '@rocicorp/zero'
import { handleQueryRequest } from '@rocicorp/zero/server'

import { schema } from '../../_shared/db/schema'
import { queries } from '../src/zero.shared'
import { getUserID } from './auth'

export async function handleQuery(request: Request) {
  const userID = await getUserID(request)
  const ctx = { userID }

  return handleQueryRequest({
    handler: (name, args) => {
      const query = mustGetQuery(queries, name)
      return query.fn({ args, ctx })
    },
    schema,
    request,
    userID: userID ?? null,
  })
}
