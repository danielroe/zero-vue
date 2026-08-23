import type {
  CustomMutatorDefs,
  DefaultContext,
  DefaultSchema,
  Schema,
  Zero,
  ZeroOptions,
} from '@rocicorp/zero'
import type { MaybeRefOrGetter } from 'vue'

/**
 * Identity helper for authoring the options passed to
 * `createZeroComposables`, preserving schema/mutator/context inference.
 * Used by the `zero-vue/nuxt` module as the default export of `zero.config.ts`.
 */
export function defineZeroOptions<
  TSchema extends Schema = DefaultSchema,
  MD extends CustomMutatorDefs | undefined = undefined,
  TContext = DefaultContext,
>(
  options: MaybeRefOrGetter<ZeroOptions<TSchema, MD, TContext> | { zero: Zero<TSchema, MD, TContext> }>,
): MaybeRefOrGetter<ZeroOptions<TSchema, MD, TContext> | { zero: Zero<TSchema, MD, TContext> }> {
  return options
}
