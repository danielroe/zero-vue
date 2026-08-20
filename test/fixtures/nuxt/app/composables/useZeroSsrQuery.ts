import type { QueryOrQueryRequest } from '@rocicorp/zero'
import type { ComputedRef, MaybeRefOrGetter } from 'vue'
import type { Schema } from '#fx/db/schema'
import { toValue, watch } from 'vue'

type AnyQuery = QueryOrQueryRequest<keyof Schema['tables'] & string, any, any, Schema, any, any>

const SSR_RUN_TIMEOUT_MS = 10_000

/**
 * Bridges Zero's reactive `useQuery` with Nuxt's `useAsyncData` so the first
 * SSR render returns data, and the client takes over with the live reactive
 * view once it has synced from zero-cache.
 *
 * If the Zero instance has no server to sync from (i.e. `cacheURL` was left
 * unset), the SSR-side call is skipped to avoid hanging on a `zero.run` that
 * can never resolve.
 *
 * The SSR fetch reads the query via `toValue(query)` at call time and does
 * not re-run; only the client-side `useQuery` view reacts to subsequent
 * changes in a reactive query source.
 *
 * If `zero.run` does not resolve within `SSR_RUN_TIMEOUT_MS`, the SSR data
 * falls back to an empty array, so a stuck zero-cache means "no SSR data"
 * rather than a hung response.
 *
 * This is the userland equivalent of what a future `zero-vue/nuxt` module
 * will do automatically.
 */
export function useZeroSsrQuery<T>(
  key: string,
  query: MaybeRefOrGetter<AnyQuery>,
) {
  const zero = useZero()
  const { data: liveRows, status } = useQuery(query as never) as {
    data: ComputedRef<readonly T[]>
    status: ComputedRef<string>
  }

  const asyncData = useAsyncData(`zero:${key}`, async () => {
    if (!zero.value.server) {
      return [] as readonly T[]
    }
    const run = zero.value.run(toValue(query), { type: 'complete' }) as Promise<readonly T[]>
    const TIMEOUT = Symbol('timeout')
    const timeout = new Promise<typeof TIMEOUT>(resolve =>
      setTimeout(resolve, SSR_RUN_TIMEOUT_MS, TIMEOUT),
    )
    const result = await Promise.race([run, timeout])
    if (result === TIMEOUT) {
      console.warn(`[useZeroSsrQuery] zero.run("${key}") did not resolve within ${SSR_RUN_TIMEOUT_MS}ms; falling back to empty SSR payload`)
      return [] as readonly T[]
    }
    return result
  }, {
    default: () => [] as readonly T[],
    deep: false,
    // Rows from `zero.run` carry a symbol-keyed refcount property that
    // devalue refuses to serialise into the Nuxt payload; round-trip through
    // JSON to strip it.
    transform: rows => JSON.parse(JSON.stringify(rows)) as readonly T[],
  })

  if (import.meta.client) {
    watch([liveRows, status], ([rows, status]) => {
      if (status === 'complete') {
        asyncData.data.value = rows
      }
    }, { immediate: true })
  }

  return asyncData
}
