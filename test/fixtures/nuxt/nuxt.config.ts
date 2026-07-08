import { fileURLToPath } from 'node:url'

export default defineNuxtConfig({
  devtools: { enabled: true },
  alias: {
    '#fx': fileURLToPath(new URL('../_shared', import.meta.url)),
  },
  app: {
    head: {
      title: 'zero-vue x Nuxt',
      htmlAttrs: { lang: 'en' },
    },
  },
  css: ['~/assets/index.css'],
  runtimeConfig: {
    authSecret: '',
    public: {
      zero: {
        cacheURL: '',
        queryURL: '',
        mutateURL: '',
      },
    },
  },
  compatibilityDate: '2025-05-25',
  vite: {
    optimizeDeps: {
      esbuildOptions: {
        target: 'es2022',
      },
      include: [
        '@rocicorp/zero',
        '@rocicorp/zero/bindings',
        'jose',
        'zod',
      ],
    },
  },
})
