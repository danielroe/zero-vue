import process from 'node:process'
import { mustGetMutator } from '@rocicorp/zero'
import { handleMutateRequest } from '@rocicorp/zero/server'
import { zeroPostgresJS } from '@rocicorp/zero/server/adapters/postgresjs'
import postgres from 'postgres'

import { schema } from '../../_shared/db/schema'
import { mutators } from '../src/zero.shared'
import { getUserID } from './auth'

function getUpstreamDB() {
  const upstreamDB = process.env.ZERO_UPSTREAM_DB
  if (!upstreamDB) {
    throw new Error('ZERO_UPSTREAM_DB is not configured')
  }
  return upstreamDB
}

const dbProvider = zeroPostgresJS(schema, postgres(getUpstreamDB()))

export async function handleMutate(request: Request) {
  const userID = await getUserID(request)
  const ctx = { userID }

  return handleMutateRequest({
    dbProvider,
    handler: transact => transact((tx, name, args) => {
      const mutator = mustGetMutator(mutators, name)
      return mutator.fn({ tx, args, ctx })
    }),
    request,
    userID: userID ?? null,
  })
}
