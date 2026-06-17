import { defineConfig } from 'vitest/config'
export default defineConfig({
  test: {
    include: ['packages/**/test/**/*.test.{ts,tsx}'],
    environment: 'node', // app component tests opt into jsdom via a `// @vitest-environment jsdom` docblock (vitest 4 removed environmentMatchGlobs)
    setupFiles: ['./vitest.setup.ts'],
  },
})
