import type { CustomMutatorDefs, Query, Schema, ZeroOptions } from '@rocicorp/zero'
import type { MaybeRefOrGetter } from 'vue'
import type { UseQueryOptions } from './query'
import { Zero } from '@rocicorp/zero'
import { shallowRef, toValue, watch } from 'vue'
import { useQuery } from './query'

export function createZero<
  S extends Schema,
  MD extends CustomMutatorDefs | undefined = undefined,
>() {
  const zero = shallowRef<Zero<S, MD>>()

  function useZero(options?: MaybeRefOrGetter<ZeroOptions<S, MD>>) {
    // Only add a watcher if the zero instance is not already initialized
    if (zero.value && !zero.value.closed) {
      return zero.value as Zero<S, MD>
    }

    if (!options)
      throw new Error('Cannot initialize Zero without options')

    watch(() => toValue(options), (opts) => {
      zero.value?.close()
      zero.value = new Zero(opts)
    }, {
      immediate: true,
      deep: true,
    })

    return zero.value as Zero<S, MD>
  }

  function _useQuery<TReturn>(
    query: MaybeRefOrGetter<Query<S, keyof S['tables'] & string, TReturn>>,
    options?: MaybeRefOrGetter<UseQueryOptions>,
  ) {
    if (zero.value === undefined) {
      throw new Error('Zero is not initialized')
    }

    return useQuery(() => zero.value!, query, options)
  }

  return {
    useZero,
    useQuery: _useQuery,
  }
}
