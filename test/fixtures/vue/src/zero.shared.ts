import {
  defineMutator,
  defineMutators,
  defineQueries,
  defineQuery,
  escapeLike,
} from '@rocicorp/zero'
import z from 'zod'

import { zql } from '../../_shared/db/schema'

export interface ZeroContext {
  userID: string | undefined
}

declare module '@rocicorp/zero' {
  interface DefaultTypes {
    context: ZeroContext
  }
}

export const mutators = defineMutators({
  message: {
    insert: defineMutator(
      z.object({
        mediumID: z.string(),
        body: z.string(),
        id: z.string(),
        timestamp: z.number(),
      }),
      async ({ tx, ctx: { userID }, args: { mediumID, body, id, timestamp } }) => {
        if (!userID) {
          throw new Error('You must be logged in to add messages')
        }

        return tx.mutate.message.insert({
          senderID: userID,
          mediumID,
          body,
          id,
          timestamp,
        })
      },
    ),
    update: defineMutator(
      z.object({ id: z.string(), body: z.string() }),
      async ({ tx, ctx: { userID }, args: { id, body } }) => {
        const messageToEdit = await tx.run(
          zql.message.where('id', id).one(),
        )
        if (!messageToEdit) {
          throw new Error(`Message with id ${id} not found`)
        }

        if (messageToEdit.senderID !== userID) {
          throw new Error(`You aren't allowed to edit this message`)
        }

        return tx.mutate.message.update({ id, body })
      },
    ),
    delete: defineMutator(
      z.object({ id: z.string() }),
      async ({ tx, ctx: { userID }, args: { id } }) => {
        if (!userID) {
          throw new Error('You must be logged in to delete')
        }

        return tx.mutate.message.delete({ id })
      },
    ),
  },
})

export const queries = defineQueries({
  messages: {
    all: defineQuery(() => zql.message),
    filtered: defineQuery(
      z.object({
        filterUser: z.string().optional(),
        filterText: z.string().optional(),
      }),
      ({ args: { filterUser, filterText } }) => {
        let filtered = zql.message
          .related('medium', medium => medium.one())
          .related('sender', sender => sender.one())
          .orderBy('timestamp', 'desc')

        if (filterUser) {
          filtered = filtered.where('senderID', filterUser)
        }

        if (filterText) {
          filtered = filtered.where('body', 'LIKE', `%${escapeLike(filterText)}%`)
        }

        return filtered
      },
    ),
  },
  users: {
    all: defineQuery(() => zql.user),
  },
  mediums: {
    all: defineQuery(() => zql.medium),
  },
})
