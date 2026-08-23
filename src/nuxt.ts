import type { NuxtModule } from '@nuxt/schema'
import { join, resolve } from 'node:path'
import { addImports, addTemplate, addTypeTemplate, defineNuxtModule, findPath, useLogger } from '@nuxt/kit'
import { COMPOSABLES_ID, relativeImport, renderOptionsTemplate, renderTypesTemplate } from './nuxt-templates'

export interface ModuleOptions {
  /**
   * Path to the file whose default export is the result of `defineZeroOptions`.
   * Resolved relative to the app directory (`srcDir`).
   *
   * @default 'zero.config'
   */
  configPath?: string
  /**
   * Whether the server-side Zero instance may connect to zero-cache during
   * SSR. When disabled (the default), any `cacheURL`/`server` in your zero
   * options is stripped on the server so no websocket is opened per request.
   *
   * @default false
   */
  ssr?: boolean
  /** Default for `runtimeConfig.public.zero.cacheURL` (overridable via `NUXT_PUBLIC_ZERO_CACHE_URL`). */
  cacheURL?: string
  /** Default for `runtimeConfig.public.zero.queryURL` (overridable via `NUXT_PUBLIC_ZERO_QUERY_URL`). */
  queryURL?: string
  /** Default for `runtimeConfig.public.zero.mutateURL` (overridable via `NUXT_PUBLIC_ZERO_MUTATE_URL`). */
  mutateURL?: string
}

const module: NuxtModule<ModuleOptions> = defineNuxtModule<ModuleOptions>({
  meta: {
    name: 'zero-vue',
    configKey: 'zero',
    compatibility: { nuxt: '>=3.13.0' },
  },
  defaults: {
    ssr: false,
    cacheURL: '',
    queryURL: '',
    mutateURL: '',
  },
  async setup(options, nuxt) {
    const logger = useLogger('zero-vue')

    nuxt.options.runtimeConfig.public.zero = {
      cacheURL: options.cacheURL,
      queryURL: options.queryURL,
      mutateURL: options.mutateURL,
      ...nuxt.options.runtimeConfig.public.zero as Record<string, unknown> | undefined,
    }

    const configPath = await findPath(
      options.configPath
        ? [resolve(nuxt.options.srcDir, options.configPath)]
        : [resolve(nuxt.options.srcDir, 'zero.config')],
    )

    if (!configPath) {
      logger.warn(
        `No \`zero.config\` file found in \`${nuxt.options.srcDir}\`. `
        + 'Create one with a default export of `defineZeroOptions(...)` to enable the zero-vue composables.',
      )
      return
    }

    nuxt.options.watch.push(configPath)

    const optionsTemplate = addTemplate({
      filename: 'zero/options.mjs',
      write: true,
      getContents: () => renderOptionsTemplate(configPath, options.ssr ?? false),
    })
    nuxt.options.alias['#zero-options'] = optionsTemplate.dst

    addTypeTemplate({
      filename: 'zero/composables.d.ts',
      getContents: ({ nuxt }) => renderTypesTemplate(
        relativeImport(join(nuxt.options.buildDir, 'zero'), configPath),
      ),
    })

    addImports(
      ['useZeroComposables', 'useZero', 'useQuery', 'useConnectionState', 'useZeroSsrQuery']
        .map(name => ({ name, from: COMPOSABLES_ID })),
    )

    nuxt.options.build.transpile.push('zero-vue')

    const optimizeDeps = nuxt.options.vite.optimizeDeps ||= {}
    optimizeDeps.include = addUnique(optimizeDeps.include, '@rocicorp/zero', '@rocicorp/zero/bindings')
    optimizeDeps.exclude = addUnique(optimizeDeps.exclude, COMPOSABLES_ID)
  },
})

export default module

function addUnique(list: string[] | undefined, ...items: string[]): string[] {
  const result = list ?? []
  for (const item of items) {
    if (!result.includes(item)) {
      result.push(item)
    }
  }
  return result
}
