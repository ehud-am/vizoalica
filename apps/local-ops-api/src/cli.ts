import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { createService, listenLoopback } from './service.js';

/** Development entry: the same service the packaged `vizoalica console` runs, from a source checkout. */
async function main(): Promise<void> {
  const packaged = fileURLToPath(new URL('../../cli/package/dist', import.meta.url));
  const version = (() => {
    try {
      const root = fileURLToPath(new URL('../../../package.json', import.meta.url));
      return (JSON.parse(readFileSync(root, 'utf8')) as { version?: string }).version;
    } catch {
      return undefined;
    }
  })();
  const { server, settings } = createService({
    ...(existsSync(join(packaged, 'schema')) ? { schemaDir: join(packaged, 'schema') } : {}),
    // The SDK files the console offers for download.
    ...(existsSync(join(packaged, 'sdk')) ? { sdkDir: join(packaged, 'sdk') } : {}),
    ...(version ? { version } : {})
  });
  await listenLoopback(server, settings.port);
  console.log(`Vizoalica local API listening on http://127.0.0.1:${settings.port}`);
  // Ctrl+C is how this is meant to be stopped, so it ends cleanly instead of as a failed command.
  const stop = () => {
    server.close(() => process.exit(0));
    server.closeAllConnections();
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
}

await main();
