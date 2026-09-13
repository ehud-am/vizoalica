import { build } from 'esbuild';
import { copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const common = {
  absWorkingDir: fileURLToPath(new URL('..', import.meta.url)),
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: ['es2022'],
  minify: true,
  alias: {
    '@vizoalica/event-contracts': './packages/event-contracts/src/index.ts',
    '@vizoalica/privacy': './packages/privacy/src/index.ts'
  }
};

await Promise.all([
  build({
    ...common,
    entryPoints: ['packages/browser-sdk/src/embed.ts'],
    outfile: 'packages/browser-sdk/dist/vizoalica.js',
    banner: { js: '/* Vizoalica browser SDK */' }
  }),
  build({
    ...common,
    entryPoints: ['packages/browser-sdk/src/dynamic-loader.ts'],
    outfile: 'packages/browser-sdk/dist/vizoalica-loader.js',
    banner: { js: '/* Vizoalica dynamic configuration loader */' }
  })
]);
await copyFile(
  'packages/browser-sdk/dist/vizoalica-loader.js',
  'examples/cloudflare-pages/public/vizoalica-loader.js'
);
console.log('Built SDK and loader bundles; synchronized the Pages loader asset');
