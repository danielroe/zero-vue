import type { ComputedRef, MaybeRefOrGetter, Ref } from 'vue'
import type { AnyZero } from './types'
import { addContextToQuery, asQueryInternals } from '@rocicorp/zero/bindings'
import { computed, toValue } from 'vue'
import { readZero } from './context'
import { isZeroLike } from './types'

export interface QueryTarget {
  readonly zero: AnyZero
  readonly query: unknown
  /** Stable identity of the query, including its output format. */
  readonly key: string
}

/**
 * Resolves a reactive query and Zero source into the query object to
 * materialize and a stable key to watch, so that a query getter re-running
 * without changing the query does not tear anything down.
 */
export function useQueryTarget(
  zero: Ref<AnyZero> | AnyZero,
  query: MaybeRefOrGetter<unknown>,
  enabled: Ref<boolean> | ComputedRef<boolean>,
  composable: string,
): ComputedRef<QueryTarget | undefined> {
  return computed(() => {
    if (!enabled.value) {
      return undefined
    }
    const instance = readZero(zero)
    const value = toValue(query)
    if (!instance || !value) {
      return undefined
    }
    if (isZeroLike(value)) {
      throw new TypeError(`[zero-vue] \`${composable}\` was passed a Zero instance where a query was expected. Pass the instance (or a ref holding it) as the first argument.`)
    }
    const contextual = addContextToQuery(value as never, instance.context)
    const internals = asQueryInternals(contextual)
    return {
      zero: instance,
      query: contextual,
      key: internals.hash() + JSON.stringify(internals.format),
    }
  })
}
