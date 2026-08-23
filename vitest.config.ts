import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      'zero-vue': fileURLToPath(
        new URL('./src/index.ts', import.meta.url).href,
      ),
    },
  },
  test: {
    include: ['src/**/*.test.ts', 'test/*.test.ts'],
    onConsoleLog(log) {
      if (log.includes('Zero starting up with no server URL')) {
        return false
      }
    },
    setupFiles: ['./test/setup.ts'],
    silent: 'passed-only',
    coverage: {
      include: ['src'],
      reporter: ['text', 'json', 'html'],
    },
  },
})
