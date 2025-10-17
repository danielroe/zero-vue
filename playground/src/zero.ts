import { useCookies } from '@vueuse/integrations/useCookies'
import { decodeJwt } from 'jose'
import { createZero } from 'zero-vue'

import { schema } from '~/db/schema'

const cookies = useCookies()

export const { useZero, useQuery } = createZero(() => {
  const encodedJWT = cookies.get('jwt')
  const decodedJWT = encodedJWT && decodeJwt(encodedJWT)
  const userID = decodedJWT?.sub ? (decodedJWT.sub as string) : 'anon'

  return {
    userID,
    auth: () => encodedJWT || undefined,
    server: import.meta.env.VITE_PUBLIC_SERVER,
    schema,
    // This is often easier to develop with if you're frequently changing
    // the schema. Switch to 'idb' for local-persistence.
    kvStore: 'mem',
  }
})
