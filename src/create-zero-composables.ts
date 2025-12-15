import type {
  ConnectionState,
  CustomMutatorDefs,
  DefaultContext,
  DefaultSchema,
  PullRow,
  QueryOrQueryRequest,
  ReadonlyJSONValue,
  Schema,
  ZeroOptions,
} from '@rocicorp/zero'
import type { MaybeRefOrGetter, Ref, ShallowRef } from 'vue'
import type { QueryResult, UseQueryOptions } from './query'
import { Zero } from '@rocicorp/zero'
import { getCurrentInstance, onUnmounted, readonly, ref, shallowRef, toValue, watch } from 'vue'
import { useQuery as _useQuery } from './query'

export function createZeroComposables<
  TSchema extends Schema = DefaultSchema,
  MD extends CustomMutatorDefs | undefined = undefined,
  TContext = DefaultContext,
>(
  optsOrZero: MaybeRefOrGetter<ZeroOptions<TSchema, MD, TContext> | { zero: Zero<TSchema, MD, TContext> }>,
) {
  let z: ShallowRef<Zero<TSchema, MD, TContext>>
  let connectionState: Ref<ConnectionState>
  let unsubscribe: () => void

  function useZero(): ShallowRef<Zero<TSchema, MD, TContext>> {
    if (!z) {
      z = shallowRef() as ShallowRef<Zero<TSchema, MD, TContext>>
    }

    if (z.value) {
      return z
    }

    watch(() => toValue(optsOrZero), (opts) => {
      if (z.value && !z.value.closed) {
        void z.value.close()
      }

      z.value = 'zero' in opts ? opts.zero : new Zero(opts)
    }, {
      deep: 1,
      immediate: true,
    })

    return z
  }

  function useQuery<
    TTable extends keyof TSchema['tables'] & string,
    TInput extends ReadonlyJSONValue | undefined,
    TOutput extends ReadonlyJSONValue | undefined,
    TReturn = PullRow<TTable, TSchema>,
  >(
    query: MaybeRefOrGetter<QueryOrQueryRequest<TTable, TInput, TOutput, TSchema, TReturn, TContext>>,
    options?: MaybeRefOrGetter<UseQueryOptions>,
  ): QueryResult<TReturn> {
    const zero = useZero()
    return _useQuery(zero, query, options)
  }

  function useConnectionState() {
    if (!connectionState) {
      useZero()

      connectionState = ref<ConnectionState>() as Ref<ConnectionState>

      watch(z, (zero) => {
        if (!zero) {
          return
        }

        connectionState.value = zero.connection.state.current
        unsubscribe = zero.connection.state.subscribe((state) => {
          connectionState.value = state
        })
      }, { immediate: true })
    }

    return readonly(connectionState)
  }

  function cleanup() {
    unsubscribe?.()
  }

  if (getCurrentInstance()) {
    onUnmounted(cleanup)
  }

  return {
    useZero,
    useQuery,
    useConnectionState,
  }
}
