import type {
  CustomMutatorDefs,
  DefaultContext,
  DefaultSchema,
  MutatorResult,
  MutatorResultDetails,
  MutatorResultErrorDetails,
  Schema,
} from '@rocicorp/zero'
import type { ComputedRef, Ref } from 'vue'
import type { ZeroSource } from './types'
import { computed, readonly, ref, shallowRef } from 'vue'
import { readZero, resolveZeroArgs } from './context'

export type MutationError = MutatorResultErrorDetails['error']

export interface UseMutationOptions {
  /**
   * Which stage `mutate` awaits, and therefore how long `pending` stays true:
   * the optimistic client-side apply, or the server's authoritative result.
   *
   * @default 'client'
   */
  awaitResult?: 'client' | 'server'
}

export interface MutationHandle<TArgs extends unknown[]> {
  /**
   * Runs the mutator. Resolves with Zero's result details rather than
   * throwing, so `mutate` is safe to call from an event handler.
   */
  mutate: (...args: TArgs) => Promise<MutatorResultDetails>
  /** Whether at least one mutation is in flight. */
  pending: ComputedRef<boolean>
  /** How many mutations are in flight. */
  inFlight: Readonly<Ref<number>>
  /** The error from the most recent failed mutation, if any. */
  error: Readonly<Ref<MutationError | undefined>>
  /** Clears {@linkcode MutationHandle.error}. */
  reset: () => void
}

export type AnyMutatorFn = (...args: any[]) => unknown

/**
 * Wraps a mutator in the pending/error state a form or button needs, so that
 * call sites do not have to track `zero.mutate(...)` promises by hand.
 *
 * @example
 * ```ts
 * const { mutate: addMessage, pending } = useMutation(mutators.message.insert)
 * await addMessage({ id, body })
 * ```
 */
export function useMutation<TFn extends AnyMutatorFn>(
  mutator: TFn,
  options?: UseMutationOptions,
): MutationHandle<Parameters<TFn>>

export function useMutation<
  TFn extends AnyMutatorFn,
  TSchema extends Schema = DefaultSchema,
  MD extends CustomMutatorDefs | undefined = undefined,
  TContext = DefaultContext,
>(
  zero: ZeroSource<TSchema, MD, TContext>,
  mutator: TFn,
  options?: UseMutationOptions,
): MutationHandle<Parameters<TFn>>

export function useMutation(...args: unknown[]): MutationHandle<unknown[]> {
  const { zero, rest } = resolveZeroArgs<[AnyMutatorFn, UseMutationOptions?]>(args)
  const [mutator, options] = rest

  if (typeof mutator !== 'function') {
    throw new TypeError('[zero-vue] `useMutation` expects a mutator, for example `mutators.message.insert`.')
  }

  const inFlight = ref(0)
  const error = shallowRef<MutationError | undefined>(undefined)

  async function mutate(...args: unknown[]): Promise<MutatorResultDetails> {
    const instance = readZero(zero)
    inFlight.value++
    try {
      const result = instance.mutate(mutator(...args) as never) as MutatorResult
      const details = await (options?.awaitResult === 'server' ? result.server : result.client)
      if (details.type === 'error') {
        error.value = details.error
      }
      return details
    }
    catch (cause) {
      const details: MutatorResultDetails = {
        type: 'error',
        error: { type: 'zero', message: cause instanceof Error ? cause.message : String(cause) },
      }
      error.value = details.type === 'error' ? details.error : undefined
      return details
    }
    finally {
      inFlight.value--
    }
  }

  return {
    mutate,
    pending: computed(() => inFlight.value > 0),
    inFlight: readonly(inFlight),
    error: readonly(error) as Readonly<Ref<MutationError | undefined>>,
    reset: () => {
      error.value = undefined
    },
  }
}
