import { randomInt } from 'node:crypto'
import process from 'node:process'
import { createError } from 'h3'
import { jwtVerify, SignJWT } from 'jose'

import { seededUserIDs } from '#fx/db/data/seeded-users'

function getAuthSecret() {
  const authSecret = process.env.VITE_AUTH_SECRET
  if (!authSecret) {
    throw createError({ statusCode: 500, statusMessage: 'VITE_AUTH_SECRET is not configured' })
  }

  return new TextEncoder().encode(authSecret)
}

export async function createJWT() {
  return await new SignJWT({
    sub: seededUserIDs[randomInt(seededUserIDs.length)]!,
    iat: Math.floor(Date.now() / 1000),
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('30days')
    .sign(getAuthSecret())
}

export async function getUserID(request: Request) {
  const authHeader = request.headers.get('authorization')
  const cookie = request.headers
    .get('cookie')
    ?.split(';')
    .map(cookie => cookie.trim())
    .find(cookie => cookie.startsWith('jwt='))

  const jwt = authHeader?.startsWith('Bearer ')
    ? authHeader.slice('Bearer '.length)
    : cookie?.slice('jwt='.length)

  if (!jwt) {
    return undefined
  }
  try {
    const { payload } = await jwtVerify(jwt, getAuthSecret())
    return typeof payload.sub === 'string' ? payload.sub : undefined
  }
  catch {
    return undefined
  }
}
