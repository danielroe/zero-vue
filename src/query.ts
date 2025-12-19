// based on https://github.com/rocicorp/mono/tree/main/packages/zero-solid

import type {
  CustomMutatorDefs,
  DefaultContext,
  DefaultSchema,
  HumanReadable,
  PullRow,
  QueryOrQueryRequest,
  ReadonlyJSONValue,
  Schema,
  TTL,
  Zero,
} from '@rocicorp/zero'
import type { ComputedRef, MaybeRefOrGetter } from 'vue'
import type { QueryError, QueryStatus, VueView } from './view'

import { addContextToQuery, asQueryInternals } from '@rocicorp/zero/bindings'
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
  TTable extends keyof TSchema['tables'] & string,
  TInput extends ReadonlyJSONValue | undefined,
  TOutput extends ReadonlyJSONValue | undefined,
  TSchema extends Schema = DefaultSchema,
  TReturn = PullRow<TTable, TSchema>,
  TContext = DefaultContext,
  MD extends CustomMutatorDefs | undefined = undefined,
>(
  z: MaybeRefOrGetter<Zero<TSchema, MD, TContext>>,
  query: MaybeRefOrGetter<QueryOrQueryRequest<TTable, TInput, TOutput, TSchema, TReturn, TContext>>,
  options?: MaybeRefOrGetter<UseQueryOptions>,
): QueryResult<TReturn> {
  const ttl = computed(() => toValue(options)?.ttl ?? DEFAULT_TTL_MS)
  const view = shallowRef<VueView | null>(null)
  const refetchKey = shallowRef(0)

  const q = shallowRef()
  watch(
    [
      () => toValue(query),
      () => toValue(z),
    ],
    ([query, z]) => {
      q.value = addContextToQuery(toValue(query), toValue(z).context)
    },
    { immediate: true },
  )

  const qi = computed(() => asQueryInternals(q.value))
  const hash = computed(() => qi.value.hash())

  watch(
    [
      () => toValue(z),
      hash,
      refetchKey,
    ],
    ([z]) => {
      view.value?.destroy()
      view.value = z.materialize(toValue(q), vueViewFactory, { ttl: toValue(ttl) })
    },
    { immediate: true },
  )

  watch(ttl, (ttl) => {
    toValue(view)?.updateTTL(ttl)
  })

  if (getCurrentInstance()) {
    onUnmounted(() => view.value?.destroy())
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
