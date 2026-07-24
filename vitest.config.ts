import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts', 'benchmarks/**/*.test.ts'],
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
