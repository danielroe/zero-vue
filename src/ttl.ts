import type { TTL } from '@rocicorp/zero'

const MULTIPLIER: Record<string, number> = {
  s: 1000,
  m: 60 * 1000,
  h: 3600 * 1000,
  d: 24 * 3600 * 1000,
  y: 365 * 24 * 3600 * 1000,
}

/**
 * Zero's `TTL` union in milliseconds, with `forever` (and negative numbers)
 * mapped to `Infinity` so that TTLs can be compared numerically.
 */
export function ttlToMs(ttl: TTL): number {
  if (typeof ttl === 'number') {
    if (Number.isNaN(ttl)) {
      return 0
    }
    return !Number.isFinite(ttl) || ttl < 0 ? Number.POSITIVE_INFINITY : ttl
  }
  if (ttl === 'none') {
    return 0
  }
  if (ttl === 'forever') {
    return Number.POSITIVE_INFINITY
  }
  const unit = ttl.at(-1)!
  return Number(ttl.slice(0, -1)) * (MULTIPLIER[unit] ?? 1)
}

/**
 * The longest-lived of the given TTLs, returned as the caller's original value
 * so that it round-trips through Zero unchanged.
 */
export function maxTTL(ttls: Iterable<TTL>): TTL | undefined {
  let max: TTL | undefined
  let maxMs = -1
  for (const ttl of ttls) {
    const ms = ttlToMs(ttl)
    if (ms > maxMs) {
      maxMs = ms
      max = ttl
    }
  }
  return max
}
