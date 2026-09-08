#!/usr/bin/env node
import { applyDeployment } from './commands/apply.js';
import { configure } from './commands/configure.js';
import { planDeployment } from './commands/plan.js';
import { preflight } from './commands/preflight.js';
import {
  defaultContext,
  profileFor,
  recordResult,
  type CommandContext
} from './commands/shared.js';
import { deploymentStatus } from './commands/status.js';
import { verifyDeployment } from './commands/verify.js';
import { failureResult, help, parseArguments, render, type ParsedArguments } from './cli.js';
import type { DeploymentResult } from './types.js';
import { DeploymentFailure } from './types.js';

export async function runCli(
  argv: readonly string[],
  context: CommandContext = defaultContext
): Promise<{ output: string; exitCode: number; result?: DeploymentResult }> {
  if (argv.length === 0 || argv.includes('--help')) return { output: help(), exitCode: 0 };
  let command: DeploymentResult['command'] = 'status';
  let parsed: ParsedArguments | undefined;
  try {
    parsed = parseArguments(argv);
    command = parsed.command;
    let value: DeploymentResult;
    switch (parsed.command) {
      case 'configure':
        value = await configure(parsed.options, context);
        break;
      case 'plan':
        value = await planDeployment(parsed.options, context);
        break;
      case 'check':
        value = await preflight(parsed.options, context);
        break;
      case 'apply':
        value = await applyDeployment(parsed.options, context);
        break;
      case 'verify':
        value = await verifyDeployment(parsed.options, context);
        break;
      case 'status':
        value = await deploymentStatus(parsed.options, context);
        break;
    }
    return {
      output: render(value, parsed.options.json === true),
      exitCode: value.ok ? 0 : value.error ? exitCodeFor(value.error.code) : 1,
      result: value
    };
  } catch (error) {
    const value = failureResult(command, error);
    if (parsed && parsed.command !== 'configure' && parsed.command !== 'status') {
      try {
        const { profile, profilePath } = await profileFor(parsed.options, context);
        await recordResult(profile, profilePath, value, context);
      } catch {
        // A malformed or inaccessible profile cannot safely supply audit metadata.
      }
    }
    const json = argv.includes('--json');
    return {
      output: render(value, json),
      exitCode: error instanceof DeploymentFailure ? error.exitCode : 2,
      result: value
    };
  }
}

export function exitCodeFor(code: string): number {
  if (['invalid_command', 'invalid_profile', 'invalid_plan', 'unsafe_path'].includes(code))
    return 2;
  if (
    [
      'onecli_missing',
      'onecli_unauthenticated',
      'provider_unavailable',
      'cloudflare_unavailable'
    ].includes(code)
  )
    return 3;
  if (
    [
      'connection_missing',
      'grant_denied',
      'credential_revoked',
      'insufficient_permission'
    ].includes(code)
  )
    return 4;
  if (['ambiguous_connection', 'agent_mismatch', 'account_mismatch'].includes(code)) return 5;
  if (['approval_required', 'plan_changed', 'receipt_expired', 'receipt_mismatch'].includes(code))
    return 6;
  if (['migration_failed', 'deploy_failed', 'operation_interrupted'].includes(code)) return 7;
  return 8;
}

const isEntryPoint =
  process.argv[1]?.endsWith('/deploy-cli/src/index.ts') ||
  process.argv[1]?.endsWith('/deploy-cli/dist/index.js');
if (isEntryPoint) {
  const outcome = await runCli(process.argv.slice(2));
  const stream = outcome.exitCode === 0 ? process.stdout : process.stderr;
  stream.write(`${outcome.output}\n`);
  process.exitCode = outcome.exitCode;
}
