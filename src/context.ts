import type { CustomMutatorDefs, DefaultContext, DefaultSchema, Schema, Zero } from '@rocicorp/zero'
import type { InjectionKey, Ref, ShallowRef } from 'vue'
import type { AnyZeroComposables } from './create-zero-composables'
import type { AnyZero } from './types'
import { hasInjectionContext, inject, isRef } from 'vue'
import { isZeroLike } from './types'

/**
 * Injection key under which {@linkcode createZeroPlugin} provides its
 * composables. Exported so that advanced setups can provide their own bundle
 * (for example one per route, or one per test).
 */
export const zeroInjectionKey: InjectionKey<AnyZeroComposables> = Symbol.for('zero-vue')

/**
 * The composables provided by {@linkcode createZeroPlugin}, or `undefined` when
 * there is no injection context or no plugin installed.
 */
export function injectZeroComposables(): AnyZeroComposables | undefined {
  return hasInjectionContext() ? inject(zeroInjectionKey, undefined) : undefined
}

/**
 * The Zero instance provided by {@linkcode createZeroPlugin}, as a ref (it is
 * replaced when the options change).
 *
 * Type it globally by augmenting Zero's `DefaultTypes`, or reach for the
 * `useZero` returned by `createZeroPlugin`/`createZeroComposables`, which is
 * typed from the options you passed.
 */
export function useZero<
  TSchema extends Schema = DefaultSchema,
  MD extends CustomMutatorDefs | undefined = undefined,
  TContext = DefaultContext,
>(): ShallowRef<Zero<TSchema, MD, TContext>> {
  return requireInjectedZero() as ShallowRef<Zero<TSchema, MD, TContext>>
}

const NO_ZERO = '[zero-vue] No Zero instance available. Install the plugin with `app.use(createZeroPlugin(options))`, use the composables returned by `createZeroComposables(options)`, or pass a Zero instance (or a ref holding one) as the first argument.'

/**
 * Splits an optional leading Zero source off a composable's arguments, falling
 * back to the injected instance.
 *
 * A getter is never treated as a Zero source, because it is indistinguishable
 * from a query getter without calling it; pass a ref or the instance itself.
 */
export function resolveZeroArgs<A extends unknown[]>(args: unknown[]): { zero: Ref<AnyZero> | AnyZero, rest: A } {
  const [first, ...rest] = args
  if (isZeroSourceArg(first)) {
    return { zero: first as Ref<AnyZero> | AnyZero, rest: rest as A }
  }
  return { zero: requireInjectedZero(), rest: args as A }
}

/** Whether an argument is a Zero instance, or a ref holding one. */
export function isZeroSourceArg(value: unknown): boolean {
  return isZeroLike(value) || (isRef(value) && isZeroLike(value.value))
}

function requireInjectedZero(): Ref<AnyZero> {
  const composables = injectZeroComposables()
  if (!composables) {
    throw new Error(NO_ZERO)
  }
  return composables.useZero()
}

/** Reads a Zero source inside a reactive effect. */
export function readZero(source: Ref<AnyZero> | AnyZero): AnyZero {
  return isRef(source) ? source.value : source
}
