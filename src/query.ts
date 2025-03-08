// based on https://github.com/rocicorp/mono/tree/main/packages/zero-solid

import type { ResultType, Schema } from '@rocicorp/zero'
import type { AdvancedQuery, HumanReadable, Query } from '@rocicorp/zero/advanced'
import type { ComputedRef, MaybeRefOrGetter } from 'vue'

import { computed, getCurrentInstance, isRef, onUnmounted, shallowRef, toValue, watch } from 'vue'
import { vueViewFactory } from './view'

interface QueryResult<TReturn> {
  data: ComputedRef<HumanReadable<TReturn>>
  status: ComputedRef<ResultType>
}

export function useQuery<
  TSchema extends Schema,
  TTable extends keyof TSchema['tables'] & string,
  TReturn,
>(_query: MaybeRefOrGetter<Query<TSchema, TTable, TReturn>>): QueryResult<TReturn> {
  const query = toValue(_query) as AdvancedQuery<TSchema, TTable, TReturn>
  const view = shallowRef(query.materialize(vueViewFactory))

  if (isRef(_query) || typeof _query === 'function') {
    watch(_query, (query) => {
      view.value.destroy()
      view.value = (query as AdvancedQuery<TSchema, TTable, TReturn>).materialize(vueViewFactory)
    })
  }

  if (getCurrentInstance()) {
    onUnmounted(() => view.value.destroy())
  }

  return {
    data: computed(() => view.value.data),
    status: computed(() => view.value.status),
  }
}
