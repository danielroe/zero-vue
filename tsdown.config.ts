import { defineConfig } from 'tsdown'

export default defineConfig([
  {
    entry: ['src/index.ts', 'src/nuxt.ts'],
    target: 'es2022',
    deps: { neverBundle: ['@nuxt/kit', '@nuxt/schema'] },
    dts: { oxc: true },
  },
  {
    entry: { 'nuxt/composables': 'src/runtime/composables.ts' },
    target: 'es2022',
    deps: { neverBundle: ['zero-vue', /^#/] },
    dts: false,
  },
])
