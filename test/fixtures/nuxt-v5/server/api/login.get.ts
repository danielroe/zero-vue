import { defineEventHandler, setCookie } from 'nuxt/server'
import { createJWT } from '../utils/auth'

export default defineEventHandler(async (event) => {
  const jwt = await createJWT()
  setCookie(event, 'jwt', jwt, {
    expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  })

  return 'ok'
})
