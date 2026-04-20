import { defineConfig } from 'vitest/config';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'));

export default defineConfig({
  define: {
    __PACKAGE_VERSION__: JSON.stringify(pkg.version),
  },
  test: {
    exclude: ['tests/e2e/**', 'node_modules/**', 'dist/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/**/types.ts',
        // renderers.ts is a pure re-export file with no logic — coverage is covered by the individual renderer modules
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
