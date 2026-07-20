// These data structures define your client-side schema.
// They must be equal to or a subset of the server-side schema.
// Note the "relationships" field, which defines first-class
// relationships between tables.
// See https://github.com/rocicorp/mono/blob/main/apps/zbugs/src/domain/schema.ts
// for more complex examples, including many-to-many.

import type { Row } from '@rocicorp/zero'
import {
  boolean,
  createBuilder,
  createSchema,
  defineMutator,
  defineMutators,
  defineQueries,
  defineQuery,
  escapeLike,
  number,
  relationships,
  string,
  table,
} from '@rocicorp/zero'
import { z } from 'zod'

const user = table('user')
  .columns({
    id: string(),
    name: string(),
    partner: boolean(),
  })
  .primaryKey('id')

const medium = table('medium')
  .columns({
    id: string(),
    name: string(),
  })
  .primaryKey('id')

const message = table('message')
  .columns({
    id: string(),
    senderID: string().from('sender_id'),
    mediumID: string().from('medium_id'),
    body: string(),
    timestamp: number(),
  })
  .primaryKey('id')

const messageRelationships = relationships(message, ({ one }) => ({
  sender: one({
    sourceField: ['senderID'],
    destField: ['id'],
    destSchema: user,
  }),
  medium: one({
    sourceField: ['mediumID'],
    destField: ['id'],
    destSchema: medium,
  }),
}))

export const schema = createSchema({
  tables: [user, medium, message],
  relationships: [messageRelationships],
  enableLegacyMutators: false,
  enableLegacyQueries: false,
})

export type Schema = typeof schema
export type Message = Row<typeof schema.tables.message>
export type Medium = Row<typeof schema.tables.medium>
export type User = Row<typeof schema.tables.user>

declare module '@rocicorp/zero' {
  interface DefaultTypes {
    schema: typeof schema
  }
}

export const zql = createBuilder(schema)

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
