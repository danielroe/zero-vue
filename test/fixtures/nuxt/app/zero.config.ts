import { decodeJwt } from 'jose'
import { defineZeroOptions } from 'zero-vue'
import { mutators, schema } from '#fx/db/schema'

import { useCookie, useRuntimeConfig } from '#imports'

export default defineZeroOptions(() => {
  const jwt = useCookie('jwt')
  const decoded = jwt.value ? decodeJwt(jwt.value) : undefined
  const userID = typeof decoded?.sub === 'string' ? decoded.sub : undefined
  const config = useRuntimeConfig()

  return {
    userID,
    auth: jwt.value || undefined,
    context: { userID },
    cacheURL: config.public.zero.cacheURL || undefined,
    queryURL: config.public.zero.queryURL,
    mutateURL: config.public.zero.mutateURL,
    schema,
    mutators,
    kvStore: 'mem' as const,
  }
})
