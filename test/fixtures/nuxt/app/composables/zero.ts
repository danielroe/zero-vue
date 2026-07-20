import { decodeJwt } from 'jose'
import { createZeroComposables } from 'zero-vue'

import { mutators, schema } from '#fx/db/schema'

function createComposables() {
  return createZeroComposables(() => {
    const jwt = useCookie('jwt')
    const decoded = jwt.value ? decodeJwt(jwt.value) : undefined
    const userID = typeof decoded?.sub === 'string' ? decoded.sub : undefined
    const config = useRuntimeConfig()

    return {
      userID,
      context: { userID },
      cacheURL: import.meta.client ? config.public.zero.cacheURL : undefined,
      queryURL: config.public.zero.queryURL,
      mutateURL: config.public.zero.mutateURL,
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
