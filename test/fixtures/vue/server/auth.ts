import { randomBytes, randomInt } from 'node:crypto'
import process from 'node:process'
import { jwtVerify, SignJWT } from 'jose'

const authSecret = new TextEncoder().encode(
  process.env.VUE_AUTH_SECRET ?? randomBytes(32).toString('base64url'),
)

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

function getAuthSecret() {
  return authSecret
}

export async function createJWT() {
  return await new SignJWT({
    sub: userIDs[randomInt(userIDs.length)]!,
    iat: Math.floor(Date.now() / 1000),
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('30days')
    .sign(getAuthSecret())
}

export async function getUserID(request: Request) {
  const cookie = request.headers
    .get('cookie')
    ?.split(';')
    .map(cookie => cookie.trim())
    .find(cookie => cookie.startsWith('jwt='))

  if (!cookie) {
    return undefined
  }

  const jwt = cookie.slice('jwt='.length)
  const { payload } = await jwtVerify(jwt, getAuthSecret())
  return typeof payload.sub === 'string' ? payload.sub : undefined
}
