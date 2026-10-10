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
      'apps/**/tests/**/*.test.tsx',
      'docs/tests/**/*.test.ts'
    ],
    environment: 'node',
    setupFiles: ['apps/admin-web/tests/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      include: [
        'apps/**/src/**/*.{ts,tsx}',
        'packages/**/src/**/*.ts',
        'examples/cloudflare-pages/functions/**/*.ts',
        'scripts/verify-website.ts',
        'scripts/cli/**/*.ts'
      ],
      // The terminal layer and the command's entry file only wrap a real TTY, process signals, and child
      // processes; everything they feed is tested, and scripts/check-package.mjs runs the real thing.
      exclude: [
        '**/src/main.tsx',
        '**/src/cli.ts',
        'apps/cli/src/bin.ts',
        'scripts/cli/terminal.ts',
        'packages/ops-core/src/terminal.ts'
      ],
      thresholds: { lines: 90, branches: 90 }
    }
  }
});
