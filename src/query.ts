// based on https://github.com/rocicorp/mono/tree/main/packages/zero-solid

import type { HumanReadable, Query, Schema, TTL, Zero } from '@rocicorp/zero'
import type { ComputedRef, MaybeRefOrGetter } from 'vue'
import type { QueryErrorDetails, QueryResultType, VueView } from './view'

import {
  computed,
  getCurrentInstance,
  onUnmounted,
  ref,
  shallowRef,
  toValue,
  watch,
} from 'vue'
import { vueViewFactory } from './view'

const DEFAULT_TTL_MS = 1_000 * 60 * 5

export interface UseQueryOptions {
  ttl?: TTL | undefined
}

export interface QueryResult<TReturn> {
  data: ComputedRef<HumanReadable<TReturn>>
  status: ComputedRef<QueryResultType>
  error: ComputedRef<QueryErrorDetails | undefined>
  refresh: () => void
}

export function useQuery<
  TSchema extends Schema,
  TTable extends keyof TSchema['tables'] & string,
  TReturn,
>(
  zero: MaybeRefOrGetter<Zero<TSchema, any>>,
  query: MaybeRefOrGetter<Query<TSchema, TTable, TReturn>>,
  options?: MaybeRefOrGetter<UseQueryOptions>,
): QueryResult<TReturn> {
  const ttl = computed(() => {
    return toValue(options)?.ttl ?? DEFAULT_TTL_MS
  })
  const view = shallowRef<VueView<HumanReadable<TReturn>> | null>(null)
  const refetchKey = ref(0)

  watch(
    [
      () => toValue(query),
      () => toValue(zero),
      refetchKey,
    ],
    ([q, zero]) => {
      view.value?.destroy()
      view.value = zero.materialize(
        q,
        vueViewFactory,
        { ttl: ttl.value },
      )
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
    error: computed(() => view.value!.error),
    refresh: () => { refetchKey.value++ },
  }
}
