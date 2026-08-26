// based on https://github.com/rocicorp/mono/tree/main/packages/zero-solid

import type {
  CustomMutatorDefs,
  DefaultContext,
  DefaultSchema,
  Falsy,
  HumanReadable,
  PullRow,
  QueryOrQueryRequest,
  ReadonlyJSONValue,
  Schema,
  TTL,
} from '@rocicorp/zero'
import type { ComputedRef, MaybeRefOrGetter } from 'vue'
import type { ZeroSource } from './types'
import type { QueryError, QueryStatus } from './view'
import type { SharedView } from './view-store'

import { DEFAULT_TTL_MS } from '@rocicorp/zero/bindings'
import {
  computed,
  effectScope,
  onScopeDispose,
  shallowRef,
  toValue,
  watch,
} from 'vue'
import { resolveZeroArgs } from './context'
import { useQueryTarget } from './query-target'
import { acquireView } from './view-store'

export interface UseQueryOptions {
  /**
   * How long Zero keeps syncing the query after the last consumer goes away.
   *
   * @default '5m'
   */
  ttl?: TTL | undefined
  /**
   * Set to `false` to tear down the query's view without unmounting the
   * component. Equivalent to passing a falsy query, and reactive.
   *
   * @default true
   */
  enabled?: boolean | undefined
}

export interface QueryResult<TReturn> {
  data: ComputedRef<HumanReadable<TReturn>>
  status: ComputedRef<QueryStatus>
  error: ComputedRef<QueryError & { retry: () => void } | undefined>
}

export interface MaybeQueryResult<TReturn> {
  data: ComputedRef<HumanReadable<TReturn> | undefined>
  status: ComputedRef<QueryStatus | 'disabled'>
  error: ComputedRef<QueryError & { retry: () => void } | undefined>
}

type AnyQueryArg<TSchema extends Schema, TContext> = MaybeRefOrGetter<

  QueryOrQueryRequest<any, any, any, TSchema, any, TContext> | Falsy
>

// Overload 1: query, using the Zero instance provided by `createZeroPlugin`
export function useQuery<
  TTable extends keyof TSchema['tables'] & string,
  TInput extends ReadonlyJSONValue | undefined,
  TOutput extends ReadonlyJSONValue | undefined,
  TSchema extends Schema = DefaultSchema,
  TReturn = PullRow<TTable, TSchema>,
  TContext = DefaultContext,
>(
  query: MaybeRefOrGetter<QueryOrQueryRequest<TTable, TInput, TOutput, TSchema, TReturn, TContext>>,
  options?: MaybeRefOrGetter<UseQueryOptions>,
): QueryResult<TReturn>

// Overload 2: maybe query, using the Zero instance provided by `createZeroPlugin`
export function useQuery<
  TTable extends keyof TSchema['tables'] & string,
  TInput extends ReadonlyJSONValue | undefined,
  TOutput extends ReadonlyJSONValue | undefined,
  TSchema extends Schema = DefaultSchema,
  TReturn = PullRow<TTable, TSchema>,
  TContext = DefaultContext,
>(
  query: MaybeRefOrGetter<QueryOrQueryRequest<TTable, TInput, TOutput, TSchema, TReturn, TContext> | Falsy>,
  options?: MaybeRefOrGetter<UseQueryOptions>,
): MaybeQueryResult<TReturn>

// Overload 3: explicit Zero instance + query
export function useQuery<
  TTable extends keyof TSchema['tables'] & string,
  TInput extends ReadonlyJSONValue | undefined,
  TOutput extends ReadonlyJSONValue | undefined,
  TSchema extends Schema = DefaultSchema,
  TReturn = PullRow<TTable, TSchema>,
  TContext = DefaultContext,
  MD extends CustomMutatorDefs | undefined = undefined,
>(
  zero: ZeroSource<TSchema, MD, TContext>,
  query: MaybeRefOrGetter<QueryOrQueryRequest<TTable, TInput, TOutput, TSchema, TReturn, TContext>>,
  options?: MaybeRefOrGetter<UseQueryOptions>,
): QueryResult<TReturn>

// Overload 4: explicit Zero instance + maybe query
export function useQuery<
  TTable extends keyof TSchema['tables'] & string,
  TInput extends ReadonlyJSONValue | undefined,
  TOutput extends ReadonlyJSONValue | undefined,
  TSchema extends Schema = DefaultSchema,
  TReturn = PullRow<TTable, TSchema>,
  TContext = DefaultContext,
  MD extends CustomMutatorDefs | undefined = undefined,
>(
  zero: ZeroSource<TSchema, MD, TContext>,
  query: MaybeRefOrGetter<QueryOrQueryRequest<TTable, TInput, TOutput, TSchema, TReturn, TContext> | Falsy>,
  options?: MaybeRefOrGetter<UseQueryOptions>,
): MaybeQueryResult<TReturn>

// Implementation
export function useQuery<TReturn>(...args: unknown[]): QueryResult<TReturn> | MaybeQueryResult<TReturn> {
  const { zero, rest } = resolveZeroArgs<[AnyQueryArg<Schema, unknown>, MaybeRefOrGetter<UseQueryOptions>?]>(args)
  const [query, options] = rest

  const ttl = computed(() => toValue(options)?.ttl ?? DEFAULT_TTL_MS)
  const enabled = computed(() => toValue(options)?.enabled ?? true)

  const scope = effectScope()
  const shared = shallowRef<SharedView | null>(null)

  scope.run(() => {
    const target = useQueryTarget(zero, query, enabled, 'useQuery')

    watch(
      [() => target.value?.zero, () => target.value?.key],
      () => {
        shared.value?.release()
        shared.value = target.value
          ? acquireView(target.value.zero, target.value.query, target.value.key, ttl.value)
          : null
      },
      { immediate: true },
    )

    watch(ttl, ttl => shared.value?.setTTL(ttl))

    onScopeDispose(() => {
      shared.value?.release()
      shared.value = null
    })
  })

  const view = computed(() => shared.value?.view.value)

  function retry() {
    shared.value?.retry()
  }

  return {
    data: computed(() => view.value?.data as HumanReadable<TReturn>),
    status: computed(() => view.value?.status ?? 'disabled'),
    error: computed(() => {
      const error = view.value?.error
      return error ? { ...error, retry } : undefined
    }),
  }
}
