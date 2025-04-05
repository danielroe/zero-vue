// based on https://github.com/rocicorp/mono/tree/main/packages/zero-solid

import type { HumanReadable, Query, ResultType, Schema } from '@rocicorp/zero'
import type { UseQueryOptions } from '@rocicorp/zero/solid'
import type { ComputedRef, MaybeRefOrGetter } from 'vue'
import type { VueView } from './view'

import { DEFAULT_TTL } from '@rocicorp/zero'
import {
  computed,
  getCurrentInstance,
  onUnmounted,
  shallowRef,
  toValue,
  watch,
} from 'vue'
import { vueViewFactory } from './view'

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
    return toValue(options)?.ttl ?? DEFAULT_TTL
  })
  const view = shallowRef<VueView<HumanReadable<TReturn>> | null>(null)

  watch(
    () => toValue(query),
    (q) => {
      view.value?.destroy()
      view.value = q.materialize(vueViewFactory, ttl.value)
    },
    { immediate: true },
  )

  watch(ttl, (ttl) => {
    toValue(query).updateTTL(ttl)
  })

  if (getCurrentInstance()) {
    onUnmounted(() => view.value!.destroy())
  }

  return {
    data: computed(() => view.value!.data),
    status: computed(() => view.value!.status),
  }
}
