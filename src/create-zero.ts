import type { CustomMutatorDefs, Query, Schema, ZeroOptions } from '@rocicorp/zero'
import type { MaybeRefOrGetter } from 'vue'
import type { UseQueryOptions } from './query'
import { Zero } from '@rocicorp/zero'
import { watch } from 'vue'
import { useQuery } from './query'

export function createZero<
  S extends Schema,
  MD extends CustomMutatorDefs | undefined = undefined,
>(options: () => ZeroOptions<S, MD>) {
  let zero: Zero<S, MD>

  function useZero() {
    // Only add a watcher if the zero instance is not already initialized
    if (zero && !zero.closed) {
      return zero
    }

    watch(() => options(), (opts) => {
      zero?.close()
      zero = new Zero(opts)
    }, {
      immediate: true,
      deep: true,
    })

    return zero
  }

  function _useQuery<TReturn>(
    query: MaybeRefOrGetter<Query<S, keyof S['tables'] & string, TReturn>>,
    options?: MaybeRefOrGetter<UseQueryOptions>,
  ) {
    if (zero === undefined) {
      throw new Error('Zero is not initialized')
    }

    return useQuery(zero, query, options)
  }

  return {
    useZero,
    useQuery: _useQuery,
  }
}
