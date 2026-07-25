import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    // Mirror the aliases declared in nuxt.config.ts so tests can import server
    // modules by the same specifiers the application uses.
    alias: {
      '#utils': fileURLToPath(new URL('./server/utils', import.meta.url)),
      '#server': fileURLToPath(new URL('./server', import.meta.url)),
      '#types': fileURLToPath(new URL('./types', import.meta.url)),
      '#imports': fileURLToPath(new URL('./tests/setup/imports.ts', import.meta.url)),
    },
  },
  test: {
    include: ['tests/**/*.test.ts', 'benchmarks/**/*.test.ts'],
    setupFiles: ['./tests/setup/nuxt-globals.ts'],
    testTimeout: 60000, // 60 second timeout for all tests
    hookTimeout: 60000, // 60 second timeout for hooks
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules',
        '.nuxt',
        '.output',
        'tests',
        'benchmarks',
        'dist',
      ],
      reportsDirectory: './coverage',
    },
  },
})
