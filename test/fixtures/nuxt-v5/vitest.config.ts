import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    globalSetup: [fileURLToPath(new URL('../../e2e/global-setup.ts', import.meta.url))],
    testTimeout: 60_000,
    hookTimeout: 180_000,
  },
})
