import { fileURLToPath } from 'node:url'

export default defineNuxtConfig({
  modules: ['zero-vue'],
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
  },
  compatibilityDate: '2025-05-25',
  vite: {
    optimizeDeps: {
      include: [
        'jose',
        'zod',
      ],
    },
  },
})
