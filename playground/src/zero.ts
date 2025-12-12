import {
  defineMutator,
  defineMutators,
  defineQueries,
  defineQuery,
  escapeLike,
} from '@rocicorp/zero'
import { useCookies } from '@vueuse/integrations/useCookies'
import { decodeJwt } from 'jose'
import { createZeroComposables } from 'zero-vue'
import z from 'zod'

import { crud, schema, zql } from '~/db/schema'

const cookies = useCookies()

export interface ZeroContext {
  sub: string
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
      async ({ tx, ctx, args: { mediumID, body, id, timestamp } }) => {
        return tx.mutate(crud.message.insert({
          senderID: ctx.sub,
          mediumID,
          body,
          id,
          timestamp,
        }))
      },
    ),
    update: defineMutator(
      z.object({ id: z.string(), body: z.string() }),
      async ({ tx, ctx, args: { id, body } }) => {
        const messageToEdit = await tx.run(
          zql.message.where('id', id).one(),
        )
        if (!messageToEdit) {
          throw new Error(`Message with id ${id} not found`)
        }

        if (messageToEdit.senderID !== ctx.sub) {
          throw new Error(`You aren't allowed to edit this message`)
        }

        return tx.mutate(crud.message.update({ id, body }))
      },
    ),
    delete: defineMutator(
      z.object({ id: z.string() }),
      async ({ tx, ctx, args: { id } }) => {
        if (!ctx.sub) {
          throw new Error('You must be logged in to delete')
        }

        return tx.mutate(crud.message.delete({ id }))
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

export const { useZero, useQuery } = createZeroComposables(() => {
  const encodedJWT = cookies.get('jwt')
  const decodedJWT = encodedJWT && decodeJwt(encodedJWT)
  const userID = decodedJWT?.sub ? (decodedJWT.sub as string) : 'anon'

  return {
    userID,
    // auth: () => encodedJWT || undefined,
    server: import.meta.env.VITE_PUBLIC_ZERO_CACHE_URL,
    schema,
    mutators,
    // This is often easier to develop with if you're frequently changing
    // the schema. Switch to 'idb' for local-persistence.
    kvStore: 'mem',
  }
})
