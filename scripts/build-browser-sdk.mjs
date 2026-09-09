import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

await build({
  absWorkingDir: fileURLToPath(new URL('..', import.meta.url)),
  entryPoints: ['packages/browser-sdk/src/embed.ts'],
  outfile: 'packages/browser-sdk/dist/vizoalica.js',
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: ['es2022'],
  minify: true,
  alias: {
    '@vizoalica/event-contracts': './packages/event-contracts/src/index.ts',
    '@vizoalica/privacy': './packages/privacy/src/index.ts'
  },
  banner: { js: '/* Vizoalica browser SDK */' }
});
console.log('Built packages/browser-sdk/dist/vizoalica.js');
