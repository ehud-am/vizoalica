import {
  FRESH_SCHEMA_QUERY,
  assertFreshD1Inspection
} from '../apps/deploy-cli/src/fresh-schema.js';
import { executeProcess } from '../apps/deploy-cli/src/process.js';

async function main(): Promise<void> {
  const args = process.argv.slice(2).filter((value) => value !== '--');
  const [databaseName, configPath] = args;
  if (args.length !== 2 || !databaseName || !configPath)
    throw new Error('Usage: pnpm deploy:fresh-check -- <database-name> <wrangler-config>');
  const result = await executeProcess({
    executable: 'pnpm',
    args: [
      'exec',
      'wrangler',
      'd1',
      'execute',
      databaseName,
      '--remote',
      '--config',
      configPath,
      '--command',
      FRESH_SCHEMA_QUERY,
      '--json'
    ],
    cwd: process.cwd(),
    env: process.env,
    timeoutMs: 60_000
  });
  assertFreshD1Inspection(result);
  console.log(`fresh D1 database confirmed: ${databaseName}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'D1 freshness check failed safely.');
  process.exitCode = 1;
});
