#!/usr/bin/env node
// The `vizoalica` command. It works from any directory (for example after `pnpm link --global`)
// because everything it does is relative to the checkout this file lives in.
import { isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { register } from 'tsx/esm/api';

const args = process.argv.slice(2);
// A path the user typed is relative to where they typed it, not to the checkout.
for (let index = 0; index < args.length - 1; index += 1)
  if (['--config', '--console-config'].includes(args[index]) && !isAbsolute(args[index + 1]))
    args[index + 1] = resolve(args[index + 1]);

process.chdir(fileURLToPath(new URL('..', import.meta.url)));
register();
const { main } = await import('../scripts/vizoalica.ts');
await main(args);
