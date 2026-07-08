import { randomBytes } from 'node:crypto'
import { SignJWT } from 'jose'

const fallbackAuthSecret = randomBytes(32).toString('base64url')

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
  const { authSecret } = useRuntimeConfig(event)
  const secret = typeof authSecret === 'string' && authSecret ? authSecret : fallbackAuthSecret

  const jwt = await new SignJWT({
    sub: userIDs[randomInt(userIDs.length)],
    iat: Math.floor(Date.now() / 1000),
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('30days')
    .sign(new TextEncoder().encode(secret))

  setCookie(event, 'jwt', jwt, {
    expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  })

  return 'ok'
})
