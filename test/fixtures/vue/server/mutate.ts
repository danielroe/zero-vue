import process from 'node:process'
import { mustGetMutator } from '@rocicorp/zero'
import { handleMutateRequest } from '@rocicorp/zero/server'
import { zeroPostgresJS } from '@rocicorp/zero/server/adapters/postgresjs'
import postgres from 'postgres'

import { mutators, schema } from '#fx/db/schema'
import { getUserID } from './auth'

let dbProvider: ReturnType<typeof zeroPostgresJS> | undefined

function getDBProvider() {
  if (!dbProvider) {
    const upstreamDB = process.env.ZERO_UPSTREAM_DB
    if (!upstreamDB) {
      throw new Error('ZERO_UPSTREAM_DB is not configured')
    }
    dbProvider = zeroPostgresJS(schema, postgres(upstreamDB))
  }
  return dbProvider
}

export async function handleMutate(request: Request) {
  const userID = await getUserID(request)
  const ctx = { userID }

  return handleMutateRequest({
    dbProvider: getDBProvider(),
    handler: transact => transact((tx, name, args) => {
      const mutator = mustGetMutator(mutators, name)
      return mutator.fn({ tx, args, ctx })
    }),
    request,
    userID,
  })
}
