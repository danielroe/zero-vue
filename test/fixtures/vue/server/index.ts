import { createApp, createRouter, defineEventHandler, setCookie, toWebRequest } from 'h3'
import { createJWT } from './auth'
import { handleMutate } from './mutate'
import { handleQuery } from './query'

const router = createRouter()

router.get('/api/login', defineEventHandler(async (event) => {
  const jwt = await createJWT()
  setCookie(event, 'jwt', jwt, {
    expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  })
  return 'ok'
}))

router.post('/api/query', defineEventHandler(event => handleQuery(toWebRequest(event))))
router.post('/api/mutate', defineEventHandler(event => handleMutate(toWebRequest(event))))

export const app = createApp().use(router)
