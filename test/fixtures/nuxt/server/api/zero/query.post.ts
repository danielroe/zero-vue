import { mustGetQuery } from '@rocicorp/zero'
import { handleQueryRequest } from '@rocicorp/zero/server'
import { toWebRequest } from 'h3'

import { queries, schema } from '#fx/db/schema'
import { getUserID } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  const userID = await getUserID(event)
  const ctx = { userID }

  return handleQueryRequest({
    handler: (name, args) => {
      const query = mustGetQuery(queries, name)
      return query.fn({ args, ctx })
    },
    schema,
    request: toWebRequest(event),
    userID,
  })
})
