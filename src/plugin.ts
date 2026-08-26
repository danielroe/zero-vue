import type { CustomMutatorDefs, DefaultContext, DefaultSchema, Schema } from '@rocicorp/zero'
import type { App, Plugin } from 'vue'
import type { ZeroComposableOptions, ZeroComposables } from './create-zero-composables'
import { zeroInjectionKey } from './context'
import { createZeroComposables } from './create-zero-composables'

export type ZeroPlugin<
  TSchema extends Schema,
  MD extends CustomMutatorDefs | undefined,
  TContext,
> = Plugin<[]> & ZeroComposables<TSchema, MD, TContext>

/**
 * Creates a Zero composables bundle and provides it to the app, so that the
 * composables exported from `zero-vue` can be used without passing a Zero
 * instance around.
 *
 * @example
 * ```ts
 * const zero = createZeroPlugin({ userID, schema, mutators, kvStore: 'mem' })
 * createApp(App).use(zero).mount('#app')
 * ```
 */
export function createZeroPlugin<
  TSchema extends Schema = DefaultSchema,
  MD extends CustomMutatorDefs | undefined = undefined,
  TContext = DefaultContext,
>(
  optsOrZero: ZeroComposableOptions<TSchema, MD, TContext>,
): ZeroPlugin<TSchema, MD, TContext> {
  const composables = createZeroComposables(optsOrZero)

  return {
    ...composables,
    install(app: App) {
      app.provide(zeroInjectionKey, composables)
      app.onUnmount?.(() => composables.dispose())
    },
  }
}
