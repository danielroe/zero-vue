import type { CustomMutatorDefs, Query, Schema, ZeroOptions } from '@rocicorp/zero'
import type { MaybeRefOrGetter, ShallowRef } from 'vue'
import type { QueryResult, UseQueryOptions } from './query'
import { Zero } from '@rocicorp/zero'
import { shallowRef, toValue, watch } from 'vue'
import { useQuery as _useQuery } from './query'

export function createZeroComposables<
  S extends Schema = Schema,
  MD extends CustomMutatorDefs | undefined = undefined,
>(
  optsOrZero: MaybeRefOrGetter<ZeroOptions<S, MD> | { zero: Zero<S, MD> }>,
) {
  let z: ShallowRef<Zero<S, MD>>

  function useZero(): ShallowRef<Zero<S, MD>> {
    if (!z) {
      z = shallowRef() as ShallowRef<Zero<S, MD>>
    }

    if (z.value) {
      return z
    }

    watch(() => toValue(optsOrZero), (opts) => {
      if (z.value && !z.value.closed) {
        void z.value.close()
      }

      z.value = 'zero' in opts ? opts.zero : new Zero(opts)
    }, { deep: true, immediate: true })

    return z
  }

  function useQuery<
    TTable extends keyof S['tables'] & string,
    TReturn,
  >(
    query: MaybeRefOrGetter<Query<S, TTable, TReturn>>,
    options?: MaybeRefOrGetter<UseQueryOptions>,
  ): QueryResult<TReturn> {
    const z = useZero()
    return _useQuery(z, query, options)
  }

  return {
    useZero,
    useQuery,
  }
}
