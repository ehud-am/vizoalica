import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@vizoalica/event-contracts': fileURLToPath(
        new URL('./packages/event-contracts/src/index.ts', import.meta.url)
      ),
      '@vizoalica/privacy': fileURLToPath(
        new URL('./packages/privacy/src/index.ts', import.meta.url)
      )
    }
  },
  test: {
    include: [
      'packages/**/tests/**/*.test.ts',
      'apps/**/tests/**/*.test.ts',
      'apps/**/tests/**/*.test.tsx'
    ],
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      include: ['apps/**/src/**/*.{ts,tsx}', 'packages/**/src/**/*.ts'],
      exclude: ['**/src/main.tsx', '**/src/cli.ts'],
      thresholds: { lines: 90, branches: 90 }
    }
  }
});
