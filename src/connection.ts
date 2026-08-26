import type { ConnectionState, CustomMutatorDefs, Schema } from '@rocicorp/zero'
import type { ComputedRef, DeepReadonly, Ref } from 'vue'
import type { ZeroSource } from './types'
import { computed, effectScope, onWatcherCleanup, readonly, ref, watch } from 'vue'
import { readZero, resolveZeroArgs } from './context'

export interface ZeroConnection {
  /** The raw connection state, as reported by Zero. */
  state: DeepReadonly<Ref<ConnectionState>>
  /** Whether Zero currently has a connection to zero-cache. */
  online: ComputedRef<boolean>
  /**
   * Whether Zero has stopped retrying because the auth token was rejected.
   * Call {@linkcode ZeroConnection.reconnect} with a fresh token to resume.
   */
  needsAuth: ComputedRef<boolean>
  /**
   * Resume connecting, optionally with a new auth token.
   *
   * Unlike changing `auth` in the options passed to `createZeroComposables`,
   * this refreshes the token in place and does not drop the local replica.
   */
  reconnect: (auth?: string) => Promise<void>
}

/**
 * Tracks the connection state of a Zero instance, with helpers for the
 * "token expired, sign in again" flow.
 */
export function useConnection<
  TSchema extends Schema,
  MD extends CustomMutatorDefs | undefined,
  TContext,
>(zero?: ZeroSource<TSchema, MD, TContext>): ZeroConnection {
  const { zero: source } = resolveZeroArgs(zero === undefined ? [] : [zero])

  const state = ref<ConnectionState>() as Ref<ConnectionState>
  const scope = effectScope()

  scope.run(() => {
    watch(() => readZero(source), (instance) => {
      if (!instance) {
        return
      }
      state.value = instance.connection.state.current
      onWatcherCleanup(instance.connection.state.subscribe((next) => {
        state.value = next
      }))
    }, { immediate: true })
  })

  return {
    state: readonly(state),
    online: computed(() => state.value?.name === 'connected'),
    needsAuth: computed(() => state.value?.name === 'needs-auth'),
    reconnect: auth => readZero(source).connection.connect(auth === undefined ? undefined : { auth }),
  }
}

/** The connection state of a Zero instance. */
export function useConnectionState<
  TSchema extends Schema,
  MD extends CustomMutatorDefs | undefined,
  TContext,
>(zero?: ZeroSource<TSchema, MD, TContext>): DeepReadonly<Ref<ConnectionState>> {
  return useConnection(zero).state
}
