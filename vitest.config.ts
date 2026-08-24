import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // The editor core is plain TypeScript and runs in Node. Only the tests
    // that touch the DOM opt into jsdom, per file.
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // jsdom has no layout engine, and ProseMirror measures the document to
    // place a cursor. Harmless in a node test, needed in a jsdom one.
    setupFiles: ['tests/setup/jsdom-layout.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
    },
  },
})
