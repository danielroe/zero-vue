import { relative } from 'node:path'

export const COMPOSABLES_ID = 'zero-vue/nuxt/composables'

/**
 * Path of `to` relative to the directory `from`, as an ESM specifier
 * (POSIX separators, extensionless, always explicitly relative).
 */
export function relativeImport(from: string, to: string): string {
  const path = relative(from, to).replace(/\.[cm]?ts$/, '').replace(/\\/g, '/')
  return path.startsWith('.') ? path : `./${path}`
}

export function renderOptionsTemplate(configPath: string, ssr: boolean): string {
  return `export { default } from ${JSON.stringify(configPath)}
export const ssr = ${JSON.stringify(ssr)}
`
}

export function renderTypesTemplate(configImport: string): string {
  return `declare module '${COMPOSABLES_ID}' {
  import type { CustomMutatorDefs, DefaultContext, DefaultSchema, QueryOrQueryRequest, Schema, Zero, ZeroOptions } from '@rocicorp/zero'
  import type { MaybeRefOrGetter } from 'vue'
  import type { ZeroComposables } from 'zero-vue'
  import type { AsyncData } from '#app'

  type UserZeroOptions = typeof import('${configImport}')['default']

  type Composables = UserZeroOptions extends MaybeRefOrGetter<
    ZeroOptions<infer TSchema extends Schema, infer MD extends CustomMutatorDefs | undefined, infer TContext>
    | { zero: Zero<infer TSchema extends Schema, infer MD extends CustomMutatorDefs | undefined, infer TContext> }
  >
    ? ZeroComposables<TSchema, MD, TContext>
    : ZeroComposables<DefaultSchema, undefined, DefaultContext>

  export function useZeroComposables(): Composables
  export const useZero: Composables['useZero']
  export const useQuery: Composables['useQuery']
  export const useConnectionState: Composables['useConnectionState']

  /**
   * Bridges Zero's reactive \`useQuery\` with Nuxt's \`useAsyncData\` so the
   * first SSR render returns data, and the client takes over with the live
   * reactive view once it has synced from zero-cache.
   */
  export function useZeroSsrQuery<T>(
    key: string,
    query: MaybeRefOrGetter<QueryOrQueryRequest<any, any, any, any, T, any>>,
  ): AsyncData<readonly T[], Error | undefined>
}
`
}
