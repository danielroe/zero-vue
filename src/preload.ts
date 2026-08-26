import type {
  CustomMutatorDefs,
  DefaultContext,
  DefaultSchema,
  Falsy,
  PullRow,
  QueryOrQueryRequest,
  ReadonlyJSONValue,
  Schema,
  TTL,
} from '@rocicorp/zero'
import type { MaybeRefOrGetter, Ref } from 'vue'
import type { ZeroSource } from './types'
import { DEFAULT_TTL_MS } from '@rocicorp/zero/bindings'
import { computed, effectScope, onScopeDispose, readonly, ref, shallowRef, toValue, watch } from 'vue'
import { resolveZeroArgs } from './context'
import { useQueryTarget } from './query-target'

export interface UsePreloadOptions {
  /**
   * How long Zero keeps the preloaded rows after the preload is cleaned up.
   *
   * @default '5m'
   */
  ttl?: TTL | undefined
  /**
   * Set to `false` to skip (and tear down) the preload. Reactive.
   *
   * @default true
   */
  enabled?: boolean | undefined
}

export interface PreloadResult {
  /** Whether the current preload has finished syncing from zero-cache. */
  complete: Readonly<Ref<boolean>>
  /** Rejection from `zero.preload`, if the preload failed. */
  error: Readonly<Ref<unknown>>
  /** Cancel the preload early. Called automatically when the scope is disposed. */
  cleanup: () => void
}

/**
 * Warms Zero's client cache with a query's rows without materializing a view,
 * cancelling the preload when the current scope (component, `effectScope`,
 * Pinia store) is disposed.
 */
export function usePreload<
  TTable extends keyof TSchema['tables'] & string,
  TInput extends ReadonlyJSONValue | undefined,
  TOutput extends ReadonlyJSONValue | undefined,
  TSchema extends Schema = DefaultSchema,
  TReturn = PullRow<TTable, TSchema>,
  TContext = DefaultContext,
>(
  query: MaybeRefOrGetter<QueryOrQueryRequest<TTable, TInput, TOutput, TSchema, TReturn, TContext> | Falsy>,
  options?: MaybeRefOrGetter<UsePreloadOptions>,
): PreloadResult

export function usePreload<
  TTable extends keyof TSchema['tables'] & string,
  TInput extends ReadonlyJSONValue | undefined,
  TOutput extends ReadonlyJSONValue | undefined,
  TSchema extends Schema = DefaultSchema,
  TReturn = PullRow<TTable, TSchema>,
  TContext = DefaultContext,
  MD extends CustomMutatorDefs | undefined = undefined,
>(
  zero: ZeroSource<TSchema, MD, TContext>,
  query: MaybeRefOrGetter<QueryOrQueryRequest<TTable, TInput, TOutput, TSchema, TReturn, TContext> | Falsy>,
  options?: MaybeRefOrGetter<UsePreloadOptions>,
): PreloadResult

export function usePreload(...args: unknown[]): PreloadResult {
  const { zero, rest } = resolveZeroArgs<[MaybeRefOrGetter<unknown>, MaybeRefOrGetter<UsePreloadOptions>?]>(args)
  const [query, options] = rest

  const ttl = computed(() => toValue(options)?.ttl ?? DEFAULT_TTL_MS)
  const enabled = computed(() => toValue(options)?.enabled ?? true)

  const complete = ref(false)
  const error = shallowRef<unknown>(undefined)
  const active = shallowRef<{ cleanup: () => void } | null>(null)

  function cleanup() {
    active.value?.cleanup()
    active.value = null
    complete.value = false
  }

  const scope = effectScope()

  scope.run(() => {
    const target = useQueryTarget(zero, query, enabled, 'usePreload')

    watch(
      [() => target.value?.zero, () => target.value?.key, ttl],
      () => {
        cleanup()
        const current = target.value
        if (!current) {
          return
        }
        error.value = undefined
        const preload = current.zero.preload(current.query as never, { ttl: ttl.value })
        active.value = preload
        preload.complete.then(() => {
          if (active.value === preload) {
            complete.value = true
          }
        }).catch((cause: unknown) => {
          if (active.value === preload) {
            error.value = cause
          }
        })
      },
      { immediate: true },
    )

    onScopeDispose(cleanup)
  })

  return {
    complete: readonly(complete),
    error: readonly(error),
    cleanup,
  }
}
