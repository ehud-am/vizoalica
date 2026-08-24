#!/usr/bin/env node
import {
  analyzeEvents,
  type AnalyzeEventsOptions,
  writeAnalyticsSummary
} from './duckdb-analysis.js';

interface CliArgs {
  storageRoot?: string;
  projectId?: string;
  date?: string;
  output?: string;
  limit?: number;
  help?: boolean;
}

async function main(argv = process.argv.slice(2)): Promise<void> {
  const args = parseArgs(argv);
  if (args.help || !args.storageRoot) {
    printHelp();
    process.exitCode = args.help ? 0 : 1;
    return;
  }

  const options: AnalyzeEventsOptions = { storageRoot: args.storageRoot };
  if (args.projectId) options.projectId = args.projectId;
  if (args.date) options.date = args.date;
  if (args.limit !== undefined) options.limit = args.limit;
  const summary = await analyzeEvents(options);

  if (args.output) {
    await writeAnalyticsSummary(summary, args.output);
    console.log(
      JSON.stringify({ ok: true, output: args.output, overview: summary.overview }, null, 2)
    );
  } else {
    console.log(JSON.stringify(summary, null, 2));
  }
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') args.help = true;
    else if (arg === '--storage-root') args.storageRoot = requireValue(arg, argv[++i]);
    else if (arg === '--project-id') args.projectId = requireValue(arg, argv[++i]);
    else if (arg === '--date') args.date = requireValue(arg, argv[++i]);
    else if (arg === '--output') args.output = requireValue(arg, argv[++i]);
    else if (arg === '--limit') args.limit = Number(requireValue(arg, argv[++i]));
    else throw new Error(`unknown argument: ${arg}`);
  }
  return args;
}

function requireValue(arg: string, value: string | undefined): string {
  if (!value) throw new Error(`missing value for ${arg}`);
  return value;
}

function printHelp(): void {
  console.log(`Usage: vizoalica-analytics --storage-root <dir> [options]

Reads Vizoalica Parquet chunks with DuckDB and prints an MVP analytics summary.

Options:
  --storage-root <dir>  Root directory containing project_id=*/dt=*/hour=*/*.parquet chunks
  --project-id <id>     Restrict to one project partition
  --date <YYYY-MM-DD>   Restrict to one date partition
  --limit <n>           Max rows for top lists, default 25
  --output <file>       Write summary JSON to a file instead of stdout
  --help                Show this help
`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
