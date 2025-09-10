// based on https://github.com/rocicorp/mono/tree/main/packages/zero-solid

import type { HumanReadable, Query, ResultType, Schema, TTL } from '@rocicorp/zero'
import type { ComputedRef, MaybeRefOrGetter } from 'vue'
import type { VueView } from './view'

import {
  computed,
  getCurrentInstance,
  hasInjectionContext,
  inject,
  onUnmounted,
  shallowRef,
  toValue,
  watch,
} from 'vue'
import { zeroSymbol } from './create-zero'
import { vueViewFactory } from './view'

const DEFAULT_TTL_MS = 1_000 * 60 * 5

export interface UseQueryOptions {
  ttl?: TTL | undefined
}

interface QueryResult<TReturn> {
  data: ComputedRef<HumanReadable<TReturn>>
  status: ComputedRef<ResultType>
}

export function useQuery<
  TSchema extends Schema,
  TTable extends keyof TSchema['tables'] & string,
  TReturn,
>(
  query: MaybeRefOrGetter<Query<TSchema, TTable, TReturn>>,
  options?: MaybeRefOrGetter<UseQueryOptions>,
): QueryResult<TReturn> {
  const ttl = computed(() => {
    return toValue(options)?.ttl ?? DEFAULT_TTL_MS
  })
  const view = shallowRef<VueView<HumanReadable<TReturn>> | null>(null)

  const z = zeroSymbol && hasInjectionContext() ? inject(zeroSymbol) : null
  if (!hasInjectionContext()) {
    console.warn('Not currently in an injection context (we can\'t call `inject` here). In the future this will throw an error.')
  }
  else if (!z) {
    console.warn('Zero-vue plugin not found, make sure to call app.use(createZero()). This is required in order to use Synced Queries, and not doing this will throw an error in future releases.')
  }

  watch(
    [() => toValue(query), () => toValue(z)],
    ([q, z]) => {
      view.value?.destroy()

      // Only present in v0.23+
      if (z?.materialize) {
        view.value = z.materialize(q, vueViewFactory, { ttl: ttl.value })
        return
      }

      view.value = q.materialize(vueViewFactory, ttl.value)
    },
    { immediate: true },
  )

  watch(ttl, (ttl) => {
    toValue(view)?.updateTTL(ttl)
  })

  if (getCurrentInstance()) {
    onUnmounted(() => view.value!.destroy())
  }

  return {
    data: computed(() => view.value!.data),
    status: computed(() => view.value!.status),
  }
}
