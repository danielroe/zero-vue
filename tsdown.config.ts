import { defineConfig } from 'tsdown'

export default defineConfig([
  {
    entry: ['src/index.ts', 'src/nuxt.ts'],
    external: ['@nuxt/kit', '@nuxt/schema'],
    dts: { oxc: true },
  },
  {
    entry: { 'nuxt/composables': 'src/runtime/composables.ts' },
    external: ['zero-vue', /^#/],
    dts: false,
  },
])
