/**
 * Build-time shims for aliases that only resolve inside a Nuxt app. The
 * runtime bundle ships untyped; precise types are declared by the module's
 * type template in the user's `.nuxt` directory.
 */

interface ImportMeta {
  readonly server: boolean
  readonly client: boolean
}

declare module '#imports' {
  import type { Ref } from 'vue'

  export function useNuxtApp(): {
    hooks: { hookOnce: (name: string, callback: () => unknown) => void }
  }
  export function useAsyncData<T>(
    key: string,
    handler: () => Promise<T>,
    options?: {
      default?: () => T
      deep?: boolean
      transform?: (input: T) => T
    },
  ): { data: Ref<T> }
}

declare module '#zero-options' {
  import type { CustomMutatorDefs, ZeroOptions } from '@rocicorp/zero'
  import type { MaybeRefOrGetter } from 'vue'

  const options: MaybeRefOrGetter<ZeroOptions<any, CustomMutatorDefs | undefined, unknown>>
  export default options
  export const ssr: boolean
}
