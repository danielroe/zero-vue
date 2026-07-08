import type { H3Event } from 'h3'
import { randomInt } from 'node:crypto'
import { createError, getCookie } from 'h3'
import { jwtVerify, SignJWT } from 'jose'

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

function getAuthSecret(event: H3Event) {
  const config = useRuntimeConfig(event)
  if (typeof config.authSecret !== 'string' || !config.authSecret) {
    throw createError({ statusCode: 500, statusMessage: 'NUXT_AUTH_SECRET is not configured' })
  }

  return new TextEncoder().encode(config.authSecret)
}

export async function createJWT(event: H3Event) {
  return await new SignJWT({
    sub: userIDs[randomInt(userIDs.length)]!,
    iat: Math.floor(Date.now() / 1000),
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('30days')
    .sign(getAuthSecret(event))
}

export async function getUserID(event: H3Event) {
  const jwt = getCookie(event, 'jwt')
  if (!jwt) {
    return undefined
  }

  const { payload } = await jwtVerify(jwt, getAuthSecret(event))
  return typeof payload.sub === 'string' ? payload.sub : undefined
}
