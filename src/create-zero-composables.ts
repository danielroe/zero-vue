import type {
  CustomMutatorDefs,
  DefaultContext,
  DefaultSchema,
  PullRow,
  QueryOrQueryRequest,
  ReadonlyJSONValue,
  Schema,
  ZeroOptions,
} from '@rocicorp/zero'
import type { MaybeRefOrGetter, ShallowRef } from 'vue'
import type { QueryResult, UseQueryOptions } from './query'
import { Zero } from '@rocicorp/zero'
import { shallowRef, toValue, watch } from 'vue'
import { useQuery as _useQuery } from './query'

export function createZeroComposables<
  TSchema extends Schema = DefaultSchema,
  MD extends CustomMutatorDefs | undefined = undefined,
  TContext = DefaultContext,
>(
  optsOrZero: MaybeRefOrGetter<ZeroOptions<TSchema, MD, TContext> | { zero: Zero<TSchema, MD, TContext> }>,
) {
  let z: ShallowRef<Zero<TSchema, MD, TContext>>

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

  return {
    useZero,
    useQuery,
  }
}
