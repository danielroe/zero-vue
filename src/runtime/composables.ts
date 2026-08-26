import { toValue, watch } from 'vue'
import { createZeroComposables } from 'zero-vue'
import { useAsyncData, useNuxtApp } from '#imports'
import userOptions, { ssr } from '#zero-options'

type Composables = ReturnType<typeof createZeroComposables>

const cache = new WeakMap<object, Composables>()

function zeroOptions() {
  const options = toValue(userOptions)
  if (import.meta.server && !ssr && !('zero' in options)) {
    return { ...options, server: undefined, cacheURL: undefined }
  }
  return options
}

export function useZeroComposables(): Composables {
  const nuxt = useNuxtApp()
  let composables = cache.get(nuxt)
  if (!composables) {
    composables = createZeroComposables(zeroOptions)
    cache.set(nuxt, composables)
    if (import.meta.server) {
      const { useZero } = composables
      nuxt.hooks.hookOnce('app:rendered', () => {
        const zero = useZero().value
        if (zero && !zero.closed) {
          void zero.close()
        }
      })
    }
  }
  return composables
}

export function useZero(): ReturnType<Composables['useZero']> {
  return useZeroComposables().useZero()
}

export function useQuery(query: never, options?: never): ReturnType<Composables['useQuery']> {
  return useZeroComposables().useQuery(query, options)
}

export function useConnectionState(): ReturnType<Composables['useConnectionState']> {
  return useZeroComposables().useConnectionState()
}

const SSR_RUN_TIMEOUT_MS = 10_000

/**
 * Bridges Zero's reactive `useQuery` with Nuxt's `useAsyncData` so the first
 * SSR render returns data, and the client takes over with the live reactive
 * view once it has synced from zero-cache.
 *
 * If the Zero instance has no server to sync from, or `zero.run` does not
 * resolve within 10s, the SSR data falls back to an empty array rather than
 * hanging the response.
 */
export function useZeroSsrQuery(key: string, query: never) {
  const zero = useZero()
  const { data: liveRows, status } = useQuery(query)

  const asyncData = useAsyncData(`zero:${key}`, async () => {
    const instance = zero.value as unknown as { server?: string | null, run: (q: unknown, opts: unknown) => Promise<readonly unknown[]> }
    if (!instance.server) {
      return [] as readonly unknown[]
    }
    const run = instance.run(toValue(query), { type: 'complete' })
    const TIMEOUT = Symbol('timeout')
    let timer: ReturnType<typeof setTimeout>
    const timeout = new Promise<typeof TIMEOUT>((resolve) => {
      timer = setTimeout(resolve, SSR_RUN_TIMEOUT_MS, TIMEOUT)
    })
    const result = await Promise.race([run, timeout]).finally(() => clearTimeout(timer))
    if (result === TIMEOUT) {
      console.warn(`[useZeroSsrQuery] zero.run("${key}") did not resolve within ${SSR_RUN_TIMEOUT_MS}ms; falling back to empty SSR payload`)
      return [] as readonly unknown[]
    }
    return result
  }, {
    default: () => [] as readonly unknown[],
    deep: false,
    // Rows from `zero.run` carry a symbol-keyed refcount property that
    // devalue refuses to serialise into the Nuxt payload; round-trip through
    // JSON to strip it.
    transform: rows => JSON.parse(JSON.stringify(rows)) as readonly unknown[],
  })

  if (import.meta.client) {
    watch([liveRows, status], ([rows, status]) => {
      if (status === 'complete') {
        asyncData.data.value = rows as readonly unknown[]
      }
    }, { immediate: true })
  }

  return asyncData
}
