// based on https://github.com/rocicorp/mono/tree/main/packages/zero-solid

import type { CustomMutatorDefs, HumanReadable, Query, Schema, TTL, Zero } from '@rocicorp/zero'
import type { ComputedRef, MaybeRefOrGetter } from 'vue'
import type { QueryError, QueryStatus, VueView } from './view'

import {
  computed,
  getCurrentInstance,
  onUnmounted,
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
  status: ComputedRef<QueryStatus>
  error: ComputedRef<QueryError & { retry: () => void } | undefined>
}

export function useQuery<
  TSchema extends Schema,
  TTable extends keyof TSchema['tables'] & string,
  TReturn,
  MD extends CustomMutatorDefs | undefined = undefined,
>(
  z: MaybeRefOrGetter<Zero<TSchema, MD>>,
  query: MaybeRefOrGetter<Query<TSchema, TTable, TReturn>>,
  options?: MaybeRefOrGetter<UseQueryOptions>,
): QueryResult<TReturn> {
  const ttl = computed(() => toValue(options)?.ttl ?? DEFAULT_TTL_MS)
  const view = shallowRef<VueView<HumanReadable<TReturn>> | null>(null)
  const refetchKey = shallowRef(0)

  watch(
    [
      () => toValue(query),
      () => toValue(z),
      refetchKey,
    ],
    ([q, z]) => {
      view.value?.destroy()
      view.value = z.materialize(q, vueViewFactory, { ttl: toValue(ttl) })
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
    data: computed(() => view.value?.data as HumanReadable<TReturn>),
    status: computed(() => view.value?.status ?? 'unknown'),
    error: computed(() => view.value?.error
      ? {
          retry: () => { refetchKey.value++ },
          ...view.value.error,
        }
      : undefined,
    ),
  }
}
