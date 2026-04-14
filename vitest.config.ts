import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    exclude: ['tests/e2e/**', 'node_modules/**', 'dist/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/**/types.ts',
        'src/lib/dashboard/renderers.ts',
      ],
      thresholds: {
        lines: 84,
        functions: 84,
        branches: 84,
        statements: 84,
      },
    },
  },
});
