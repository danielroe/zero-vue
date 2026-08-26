import type {
  ConnectionState,
  CustomMutatorDefs,
  DefaultContext,
  DefaultSchema,
  Falsy,
  PullRow,
  QueryOrQueryRequest,
  ReadonlyJSONValue,
  Schema,
  ZeroOptions,
} from '@rocicorp/zero'
import type { DeepReadonly, MaybeRefOrGetter, Ref, ShallowRef } from 'vue'
import type { ZeroConnection } from './connection'
import type { AnyMutatorFn, MutationHandle, UseMutationOptions } from './mutation'
import type { PreloadResult, UsePreloadOptions } from './preload'
import type { MaybeQueryResult, QueryResult, UseQueryOptions } from './query'
import type { UseSuspenseQueryOptions } from './suspense'
import { Zero } from '@rocicorp/zero'
import { effectScope, shallowRef, toValue, watch } from 'vue'
import { useConnection } from './connection'
import { useMutation as _useMutation } from './mutation'
import { usePreload as _usePreload } from './preload'
import { useQuery as _useQuery } from './query'
import { useSuspenseQuery as _useSuspenseQuery } from './suspense'

/** Options accepted by {@linkcode createZeroComposables}. */
export type ZeroComposableOptions<
  TSchema extends Schema,
  MD extends CustomMutatorDefs | undefined,
  TContext,
> = MaybeRefOrGetter<ZeroOptions<TSchema, MD, TContext> | { zero: Zero<TSchema, MD, TContext> }>

export interface ZeroComposables<
  TSchema extends Schema,
  MD extends CustomMutatorDefs | undefined,
  TContext,
> {
  /** The current Zero instance. Replaced if the options change. */
  useZero: () => ShallowRef<Zero<TSchema, MD, TContext>>
  useQuery: {
    <
      TTable extends keyof TSchema['tables'] & string,
      TInput extends ReadonlyJSONValue | undefined,
      TOutput extends ReadonlyJSONValue | undefined,
      TReturn = PullRow<TTable, TSchema>,
    >(
      query: MaybeRefOrGetter<QueryOrQueryRequest<TTable, TInput, TOutput, TSchema, TReturn, TContext>>,
      options?: MaybeRefOrGetter<UseQueryOptions>,
    ): QueryResult<TReturn>
    <
      TTable extends keyof TSchema['tables'] & string,
      TInput extends ReadonlyJSONValue | undefined,
      TOutput extends ReadonlyJSONValue | undefined,
      TReturn = PullRow<TTable, TSchema>,
    >(
      query: MaybeRefOrGetter<QueryOrQueryRequest<TTable, TInput, TOutput, TSchema, TReturn, TContext> | Falsy>,
      options?: MaybeRefOrGetter<UseQueryOptions>,
    ): MaybeQueryResult<TReturn>
  }
  useSuspenseQuery: <
    TTable extends keyof TSchema['tables'] & string,
    TInput extends ReadonlyJSONValue | undefined,
    TOutput extends ReadonlyJSONValue | undefined,
    TReturn = PullRow<TTable, TSchema>,
  >(
    query: MaybeRefOrGetter<QueryOrQueryRequest<TTable, TInput, TOutput, TSchema, TReturn, TContext>>,
    options?: MaybeRefOrGetter<UseSuspenseQueryOptions>,
  ) => Promise<QueryResult<TReturn>>
  usePreload: <
    TTable extends keyof TSchema['tables'] & string,
    TInput extends ReadonlyJSONValue | undefined,
    TOutput extends ReadonlyJSONValue | undefined,
    TReturn = PullRow<TTable, TSchema>,
  >(
    query: MaybeRefOrGetter<QueryOrQueryRequest<TTable, TInput, TOutput, TSchema, TReturn, TContext> | Falsy>,
    options?: MaybeRefOrGetter<UsePreloadOptions>,
  ) => PreloadResult
  useMutation: <TFn extends AnyMutatorFn>(
    mutator: TFn,
    options?: UseMutationOptions,
  ) => MutationHandle<Parameters<TFn>>
  useConnectionState: () => DeepReadonly<Ref<ConnectionState>>
  useConnection: () => ZeroConnection
  /**
   * Stops every watcher owned by this bundle and closes the current Zero
   * instance. Call this when the bundle's lifetime ends: after an SSR
   * response has rendered, or when the scope that created it is disposed.
   */
  dispose: () => void
}

/** A composables bundle with its schema, mutators and context unconstrained. */

export type AnyZeroComposables = ZeroComposables<any, any, any>

export function createZeroComposables<
  TSchema extends Schema = DefaultSchema,
  MD extends CustomMutatorDefs | undefined = undefined,
  TContext = DefaultContext,
>(
  optsOrZero: ZeroComposableOptions<TSchema, MD, TContext>,
): ZeroComposables<TSchema, MD, TContext> {
  type ZeroInstance = Zero<TSchema, MD, TContext>

  const scope = effectScope(true)
  const z = shallowRef<ZeroInstance>() as ShallowRef<ZeroInstance>

  let started = false
  let connection: ZeroConnection | undefined
  let disposed = false

  function useZero(): ShallowRef<ZeroInstance> {
    if (started) {
      return z
    }
    started = true

    scope.run(() => {
      watch(() => toValue(optsOrZero), (opts, previousOpts) => {
        const current = z.value

        if (current && !current.closed && previousOpts && isAuthOnlyChange(previousOpts, opts)) {
          void current.connection.connect({ auth: (opts as ZeroOptions<TSchema, MD, TContext>).auth as string })
          return
        }

        if (current && !current.closed) {
          void current.close()
        }

        z.value = 'zero' in opts ? opts.zero : new Zero(opts)
      }, {
        deep: 1,
        immediate: true,
      })
    })

    return z
  }

  function useQuery(query: never, options?: never) {
    return _useQuery(useZero(), query, options)
  }

  function useSuspenseQuery(query: never, options?: never) {
    return _useSuspenseQuery(useZero(), query, options)
  }

  function usePreload(query: never, options?: never) {
    return _usePreload(useZero(), query, options)
  }

  function useMutation(mutator: never, options?: never) {
    return _useMutation(useZero(), mutator, options)
  }

  function getConnection(): ZeroConnection {
    if (!connection) {
      const zero = useZero()
      connection = scope.run(() => useConnection(zero))!
    }
    return connection
  }

  function dispose() {
    if (disposed) {
      return
    }
    disposed = true
    scope.stop()
    const current = z.value
    if (current && !current.closed) {
      void current.close()
    }
  }

  return {
    useZero,
    useQuery,
    useSuspenseQuery,
    usePreload,
    useMutation,
    useConnectionState: () => getConnection().state,
    useConnection: getConnection,
    dispose,
  } as ZeroComposables<TSchema, MD, TContext>
}

/**
 * Zero refreshes its server-side auth context without reconnecting, so a token
 * refresh should update the existing instance rather than recreate it (which
 * would drop the local replica). Transitions to or from logged-out still need
 * a new instance, per Zero's own guidance.
 */
function isAuthOnlyChange(previous: object, next: object): boolean {
  if ('zero' in previous || 'zero' in next) {
    return false
  }

  const previousAuth = (previous as { auth?: unknown }).auth
  const nextAuth = (next as { auth?: unknown }).auth

  if (typeof previousAuth !== 'string' || typeof nextAuth !== 'string' || previousAuth === nextAuth) {
    return false
  }

  const keys = new Set([...Object.keys(previous), ...Object.keys(next)])
  for (const key of keys) {
    if (key === 'auth') {
      continue
    }
    if (!Object.is((previous as Record<string, unknown>)[key], (next as Record<string, unknown>)[key])) {
      return false
    }
  }

  return true
}
