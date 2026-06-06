import { SignJWT } from 'jose'

// See docker/seed.sql for the seeded user list.
const userIDs = [
  '6z7dkeVLNm',
  'ycD76wW4R2',
  'IoQSaxeVO5',
  'WndZWmGkO4',
  'ENzoNm7g4E',
  'dLKecN3ntd',
  '7VoEoJWEwn',
  'enVvyDlBul',
  '9ogaDuDNFx',
]

function randomInt(max: number) {
  return Math.floor(Math.random() * max)
}

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event)
  if (!config.zero.authSecret) {
    throw createError({ statusCode: 500, statusMessage: 'ZERO_AUTH_SECRET is not configured' })
  }

  const jwt = await new SignJWT({
    sub: userIDs[randomInt(userIDs.length)],
    iat: Math.floor(Date.now() / 1000),
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('30days')
    .sign(new TextEncoder().encode(config.zero.authSecret))

  setCookie(event, 'jwt', jwt, {
    expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  })

  return 'ok'
})
