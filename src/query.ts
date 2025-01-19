// based on https://github.com/rocicorp/mono/tree/main/packages/zero-solid

import type { AdvancedQuery, Query, QueryType, Smash, TableSchema } from '@rocicorp/zero/advanced'
import type { ComputedRef, MaybeRefOrGetter } from 'vue'
import { computed, getCurrentInstance, isRef, onUnmounted, shallowRef, toValue, watch } from 'vue'

import { type ResultType, vueViewFactory } from './view'

type QueryResultDetails = Readonly<{
  type: ResultType
}>

interface QueryResult<TReturn extends QueryType> {
  data: ComputedRef<Smash<TReturn>>
  resultDetails: ComputedRef<QueryResultDetails>
}

export function useQuery<
  TSchema extends TableSchema,
  TReturn extends QueryType,
>(_query: MaybeRefOrGetter<Query<TSchema, TReturn>>): QueryResult<TReturn> {
  const query = toValue(_query) as AdvancedQuery<TSchema, TReturn>
  const view = shallowRef(query.materialize(vueViewFactory))

  if (isRef(_query) || _query instanceof Function) {
    watch(_query, (query) => {
      view.value.destroy()
      view.value = (query as AdvancedQuery<TSchema, TReturn>).materialize(vueViewFactory)
    })
  }

  if (getCurrentInstance()) {
    onUnmounted(() => view.value.destroy())
  }

  return {
    data: computed(() => view.value.data),
    resultDetails: computed(() => ({ type: view.value.resultType })),
  }
}
