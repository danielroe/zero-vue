import { useCookies } from '@vueuse/integrations/useCookies'
import { decodeJwt } from 'jose'
import { createZeroComposables } from 'zero-vue'

import { schema } from '../../_shared/db/schema'
import { mutators } from './zero.shared'

export { mutators, queries } from './zero.shared'

const cookies = useCookies()

export const { useZero, useQuery } = createZeroComposables(() => {
  const encodedJWT = cookies.get('jwt')
  const decodedJWT = encodedJWT && decodeJwt(encodedJWT)
  const userID = typeof decodedJWT?.sub === 'string' ? decodedJWT.sub : undefined

  return {
    userID,
    context: { userID },
    cacheURL: import.meta.env.VITE_PUBLIC_ZERO_CACHE_URL,
    schema,
    mutators,
    // This is often easier to develop with if you're frequently changing
    // the schema. Switch to 'idb' for local-persistence.
    kvStore: 'mem',
  }
})
