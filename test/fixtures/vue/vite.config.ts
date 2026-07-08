import process from 'node:process'
import { fileURLToPath, URL } from 'node:url'

import vue from '@vitejs/plugin-vue'
import { toNodeListener } from 'h3'
import { defineConfig, loadEnv } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  Object.assign(process.env, loadEnv(mode, process.cwd(), ''))

  return {
    server: {
      port: 3000,
    },
    plugins: [
      vue(),
      {
        name: 'fixture-server',
        configureServer(server) {
          let listener: ReturnType<typeof toNodeListener> | undefined

          server.middlewares.use(async (req, res, next) => {
            if (!req.url?.startsWith('/api')) {
              return next()
            }

            try {
              listener ??= toNodeListener((await import('./server')).app)
              listener(req, res)
            }
            catch (error) {
              next(error)
            }
          })
        },
      },
    ],
    resolve: {
      alias: {
        '~': fileURLToPath(new URL('./src', import.meta.url)),
        '#fx': fileURLToPath(new URL('../_shared', import.meta.url)),
        'zero-vue': fileURLToPath(new URL('../../../src/index.ts', import.meta.url).href),
      },
    },
  }
})
