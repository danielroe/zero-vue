import type { RequestEvent } from 'nuxt/server'
import { randomInt } from 'node:crypto'
import { jwtVerify, SignJWT } from 'jose'
import { createError, getCookie, getRequestHeader, useRuntimeConfig } from 'nuxt/server'

import { seededUserIDs } from '#fx/db/data/seeded-users'

function getAuthSecret() {
  const config = useRuntimeConfig()
  if (typeof config.authSecret !== 'string' || !config.authSecret) {
    throw createError({ status: 500, statusText: 'NUXT_AUTH_SECRET is not configured' })
  }

  return new TextEncoder().encode(config.authSecret)
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

export async function getUserID(event: RequestEvent) {
  const authHeader = getRequestHeader(event, 'authorization')
  const jwt = authHeader?.startsWith('Bearer ')
    ? authHeader.slice('Bearer '.length)
    : getCookie(event, 'jwt')
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
