import { describe, expect, it } from 'vitest'
import { maxTTL, ttlToMs } from './ttl'

describe('ttlToMs', () => {
  it('parses zero ttl values', () => {
    expect(ttlToMs('none')).toBe(0)
    expect(ttlToMs('30s')).toBe(30_000)
    expect(ttlToMs('5m')).toBe(300_000)
    expect(ttlToMs('2h')).toBe(7_200_000)
    expect(ttlToMs('1d')).toBe(86_400_000)
    expect(ttlToMs('1y')).toBe(31_536_000_000)
    expect(ttlToMs(1234)).toBe(1234)
  })

  it('treats forever, negative and infinite ttls as unbounded', () => {
    expect(ttlToMs('forever')).toBe(Number.POSITIVE_INFINITY)
    expect(ttlToMs(-1)).toBe(Number.POSITIVE_INFINITY)
    expect(ttlToMs(Number.POSITIVE_INFINITY)).toBe(Number.POSITIVE_INFINITY)
  })

  it('treats NaN as no ttl', () => {
    expect(ttlToMs(Number.NaN)).toBe(0)
  })
})

describe('maxTTL', () => {
  it('returns the longest ttl in its original form', () => {
    expect(maxTTL(['30s', '10m', '5m'])).toBe('10m')
    expect(maxTTL(['10m', 'forever'])).toBe('forever')
    expect(maxTTL([600_000, '5m'])).toBe(600_000)
  })

  it('returns undefined when there are no ttls', () => {
    expect(maxTTL([])).toBeUndefined()
  })
})
