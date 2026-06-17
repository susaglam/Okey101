import { defineConfig } from 'vitest/config'
export default defineConfig({
  test: {
    include: ['packages/**/test/**/*.test.{ts,tsx}'],
    environment: 'node',
    environmentMatchGlobs: [['packages/app/**', 'jsdom']],
    setupFiles: ['./vitest.setup.ts'],
  },
})
