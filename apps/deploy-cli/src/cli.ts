import { safeMessage } from './redaction.js';
import type { CommandName, DeploymentResult } from './types.js';
import { DeploymentFailure } from './types.js';

export interface ParsedArguments {
  command: CommandName;
  options: Record<string, string | boolean>;
}

const COMMANDS = new Set<CommandName>(['configure', 'plan', 'check', 'apply', 'verify', 'status']);
const FORBIDDEN_OPTIONS = /(token|secret|password|authorization|api.?key|email|passthrough)/i;

export function parseArguments(argv: readonly string[]): ParsedArguments {
  const [candidate, ...rest] = argv;
  if (!candidate || !COMMANDS.has(candidate as CommandName))
    throw new DeploymentFailure('invalid_command', 'Unknown deployment command.', 2, 'review');
  const options: Record<string, string | boolean> = {};
  for (let index = 0; index < rest.length; index += 1) {
    const item = rest[index];
    if (item === '--') continue;
    if (!item?.startsWith('--'))
      throw new DeploymentFailure(
        'invalid_command',
        'Unexpected positional argument.',
        2,
        'review'
      );
    const key = item.slice(2);
    if (!key || FORBIDDEN_OPTIONS.test(key))
      throw new DeploymentFailure(
        'invalid_command',
        'Credential and passthrough options are forbidden.',
        2,
        'review'
      );
    const next = rest[index + 1];
    if (!next || next.startsWith('--')) options[key] = true;
    else {
      options[key] = next;
      index += 1;
    }
  }
  return { command: candidate as CommandName, options };
}

export function option(
  options: Record<string, string | boolean>,
  name: string,
  required = true
): string | undefined {
  const value = options[name];
  if (typeof value === 'string') return value;
  if (required) throw new DeploymentFailure('invalid_command', `Missing --${name}.`, 2, 'review');
  return undefined;
}

export function actorId(env: NodeJS.ProcessEnv = process.env): string {
  const value = env.VIZOALICA_DEPLOY_ACTOR ?? env.GITHUB_ACTOR ?? env.USER ?? 'unknown';
  return /^[A-Za-z0-9][A-Za-z0-9._@/-]{0,127}$/.test(value) ? value : 'unknown';
}

export function result(
  command: CommandName,
  partial: Partial<DeploymentResult> = {}
): DeploymentResult {
  return {
    schemaVersion: 1,
    ok: true,
    command,
    status: 'succeeded',
    occurredAt: new Date().toISOString(),
    completedOperations: [],
    pendingOperations: [],
    ...partial
  };
}

export function failureResult(command: CommandName, error: unknown): DeploymentResult {
  const failure =
    error instanceof DeploymentFailure
      ? error
      : new DeploymentFailure('provider_unavailable', 'Deployment failed.', 3, 'retry', true);
  const status =
    failure.code === 'receipt_expired'
      ? 'expired'
      : failure.exitCode === 4 || failure.exitCode === 5 || failure.exitCode === 6
        ? 'denied'
        : failure.code === 'operation_interrupted'
          ? 'interrupted'
          : 'failed';
  return result(command, {
    ok: false,
    status,
    error: {
      code: failure.code,
      message: safeMessage(failure.code),
      ...(failure.remediation ? { remediation: failure.remediation } : {}),
      retrySafe: failure.retrySafe
    }
  });
}

export function render(value: DeploymentResult, json: boolean): string {
  if (json) return JSON.stringify(value);
  if (value.ok) {
    const id = value.planId ? ` Plan: ${value.planId}.` : '';
    return `${value.command} succeeded.${id}`;
  }
  return `${value.command} ${value.status}: ${value.error?.message ?? 'The operation failed safely.'}`;
}

export function help(): string {
  return [
    'Vizoalica Cloudflare deployment',
    'Commands: configure, plan, check, apply, verify, status',
    'Every command accepts --profile <path> and --json.',
    'Apply additionally requires --plan, --receipt, and --approve <exact-plan-id>.',
    'Credential values are never accepted as options.'
  ].join('\n');
}
