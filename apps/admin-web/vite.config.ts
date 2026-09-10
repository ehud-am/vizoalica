import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const rootPackageJson = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../package.json', import.meta.url)), 'utf8')
) as { version?: unknown };
const appVersion =
  typeof rootPackageJson.version === 'string' ? rootPackageJson.version : 'unknown';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    __VIZOALICA_VERSION__: JSON.stringify(appVersion)
  },
  server: {
    host: '127.0.0.1',
    proxy: { '/api': 'http://127.0.0.1:4318' }
  }
});
