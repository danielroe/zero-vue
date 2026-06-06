import { fileURLToPath, URL } from 'node:url'

import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
  ],
  resolve: {
    alias: {
      '~': fileURLToPath(new URL('./src', import.meta.url)),
      '#fx': fileURLToPath(new URL('../_shared', import.meta.url)),
      'zero-vue': fileURLToPath(new URL('../../../src/index.ts', import.meta.url).href),
    },
  },
})
