import {
  defineMutator,
  defineMutators,
  defineQueries,
  defineQuery,
  escapeLike,
} from '@rocicorp/zero'
import { decodeJwt } from 'jose'
import { createZeroComposables } from 'zero-vue'
import z from 'zod'

import { schema, zql } from '#fx/db/schema'

export interface ZeroContext {
  userID: string
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

function createComposables() {
  return createZeroComposables(() => {
    const jwt = useCookie('jwt')
    const decoded = jwt.value ? decodeJwt(jwt.value) : undefined
    const userID = typeof decoded?.sub === 'string' ? decoded.sub : 'anon'
    const config = useRuntimeConfig()

    return {
      userID,
      auth: jwt.value || undefined,
      context: { userID },
      server: import.meta.client ? config.public.zero.cacheURL : undefined,
      schema,
      mutators,
      kvStore: 'mem' as const,
    }
  })
}

type ZeroComposables = ReturnType<typeof createComposables>

declare module '#app' {
  interface NuxtApp {
    _zeroComposables?: ZeroComposables
  }
}

function getZeroComposables(): ZeroComposables {
  const nuxt = useNuxtApp()
  nuxt._zeroComposables ??= createComposables()
  return nuxt._zeroComposables
}

export const useZero: ZeroComposables['useZero'] = () => getZeroComposables().useZero()
export const useQuery = ((query: unknown, options?: unknown) =>
  (getZeroComposables().useQuery as (...args: unknown[]) => unknown)(query, options)) as ZeroComposables['useQuery']
