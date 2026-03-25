import { defineVitestConfig } from '@nuxt/test-utils/config'

export default defineVitestConfig({
  test: {
    environment: 'happy-dom',
    globals: true,
    setupFiles: ['./tests/setup/vitest.setup.ts'],
    environmentOptions: {
      nuxtRuntimeConfig: {
        app: {
          baseURL: '/',
          buildAssetsDir: '/_nuxt/',
          cdnURL: '',
        },
      },
    },
    include: [
      'tests/unit/**/*.spec.ts',
      'tests/unit/**/*.test.ts',
      'tests/components/**/*.spec.ts',
      'tests/components/**/*.test.ts',
    ],
    exclude: ['tests/e2e/**', 'node_modules/**', '.nuxt/**', '.output/**'],
    coverage: {
      provider: 'v8',
      reportsDirectory: './coverage',
      reporter: ['text', 'html', 'lcov'],
      include: ['components/**/*.vue', 'composables/**/*.ts', 'server/**/*.ts', 'utils/**/*.ts'],
      exclude: [
        'components/ui/**',
        'composables/aruna_api_json/**',
        'tests/**',
        '**/*.d.ts',
      ],
    },
  },
})
