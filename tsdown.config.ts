import { defineConfig } from 'tsdown'

export default defineConfig([
  {
    entry: ['src/index.ts', 'src/nuxt.ts'],
    target: 'es2022',
    deps: { neverBundle: ['@nuxt/kit', '@nuxt/schema'] },
    dts: { oxc: true },
    publint: true,
    attw: {
      profile: 'esm-only',
      level: 'error',
      excludeEntrypoints: ['./nuxt/composables'],
    },
  },
  {
    entry: { 'nuxt/composables': 'src/runtime/composables.ts' },
    target: 'es2022',
    deps: { neverBundle: ['zero-vue', /^#/] },
    dts: false,
  },
])
