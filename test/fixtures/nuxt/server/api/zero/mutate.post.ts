import process from 'node:process'
import { mustGetMutator } from '@rocicorp/zero'
import { handleMutateRequest } from '@rocicorp/zero/server'
import { zeroPostgresJS } from '@rocicorp/zero/server/adapters/postgresjs'
import { toWebRequest } from 'h3'
import postgres from 'postgres'

import { mutators, schema } from '#fx/db/schema'
import { getUserID } from '../../utils/auth'

function getUpstreamDB() {
  const upstreamDB = process.env.ZERO_UPSTREAM_DB
  if (!upstreamDB) {
    throw new Error('ZERO_UPSTREAM_DB is not configured')
  }
  return upstreamDB
}

const dbProvider = zeroPostgresJS(schema, postgres(getUpstreamDB()))

export default defineEventHandler(async (event) => {
  const userID = await getUserID(event)
  const ctx = { userID }

  return handleMutateRequest({
    dbProvider,
    handler: transact => transact((tx, name, args) => {
      const mutator = mustGetMutator(mutators, name)
      return mutator.fn({ tx, args, ctx })
    }),
    request: toWebRequest(event),
    userID,
  })
})
