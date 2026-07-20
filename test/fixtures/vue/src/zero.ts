import { useCookies } from '@vueuse/integrations/useCookies'
import { decodeJwt } from 'jose'
import { createZeroComposables } from 'zero-vue'

import { mutators, schema } from '#fx/db/schema'

export { mutators, queries } from '#fx/db/schema'

const cookies = useCookies()

export const { useZero, useQuery } = createZeroComposables(() => {
  const encodedJWT = cookies.get('jwt')
  const decodedJWT = encodedJWT && decodeJwt(encodedJWT)
  const userID = typeof decodedJWT?.sub === 'string' ? decodedJWT.sub : undefined

  return {
    userID,
    context: { userID },
    cacheURL: import.meta.env.VITE_PUBLIC_ZERO_CACHE_URL,
    queryURL: import.meta.env.VITE_PUBLIC_ZERO_QUERY_URL,
    mutateURL: import.meta.env.VITE_PUBLIC_ZERO_MUTATE_URL,
    schema,
    mutators,
    // This is often easier to develop with if you're frequently changing
    // the schema. Switch to 'idb' for local-persistence.
    kvStore: 'mem',
  }
})
