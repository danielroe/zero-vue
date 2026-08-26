import type { CustomMutatorDefs, Schema, Zero } from '@rocicorp/zero'
import type { Ref } from 'vue'

/** A Zero instance with its schema, mutators and context left unconstrained. */

export type AnyZero = Zero<any, any, any>

/**
 * Where a composable gets its Zero instance from: the instance itself, or a ref
 * holding it (as returned by `useZero()`, which swaps the instance out when the
 * options change).
 */
export type ZeroSource<
  TSchema extends Schema,
  MD extends CustomMutatorDefs | undefined,
  TContext,
> = Zero<TSchema, MD, TContext> | Ref<Zero<TSchema, MD, TContext>>

export function isZeroLike(value: unknown): value is AnyZero {
  return !!value
    && typeof value === 'object'
    && typeof (value as AnyZero).materialize === 'function'
    && typeof (value as AnyZero).mutate === 'function'
    && 'connection' in value
}
