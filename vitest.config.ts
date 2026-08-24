import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // The editor core is plain TypeScript and runs in Node. Only the tests
    // that touch the DOM opt into jsdom, per file.
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
    },
  },
})
