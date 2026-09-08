const SECRET_PATTERNS: RegExp[] = [
  /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi,
  /\b(?:CF_API_TOKEN|CLOUDFLARE_API_TOKEN|CF_API_KEY|CLOUDFLARE_API_KEY|ONECLI_API_KEY|ONECLI_TOKEN)\s*[=:]\s*[^\s,;]+/gi,
  /\b(?:Authorization)\s*:\s*[^\r\n]+/gi,
  /\b(?:v1\.0-[A-Za-z0-9_-]{20,}|[A-Za-z0-9_-]{40,})\b/g
];

export function redact(value: string, sentinels: readonly string[] = []): string {
  let safe = value;
  for (const pattern of SECRET_PATTERNS) safe = safe.replace(pattern, '[REDACTED]');
  for (const sentinel of sentinels) {
    if (sentinel) safe = safe.split(sentinel).join('[REDACTED]');
  }
  return safe;
}

const MESSAGES: Record<string, string> = {
  invalid_command: 'The deployment command is invalid.',
  invalid_profile: 'The deployment profile is invalid.',
  invalid_plan: 'The deployment plan is invalid or no longer matches the profile.',
  unsafe_path:
    'Deployment state must be stored outside the repository in an operator-owned location.',
  onecli_missing: 'OneCLI 2.11 or newer is required for this profile.',
  onecli_unauthenticated: 'OneCLI authentication is unavailable for the selected project.',
  provider_unavailable: 'The selected credential provider is unavailable.',
  cloudflare_unavailable: 'Cloudflare could not be reached through the selected provider.',
  connection_missing: 'The selected Cloudflare connection is unavailable.',
  grant_denied: 'The deployment identity is not granted the selected Cloudflare connection.',
  credential_revoked: 'The selected Cloudflare credential is expired or revoked.',
  insufficient_permission: 'The selected credential lacks a required Cloudflare capability.',
  ambiguous_connection: 'More than one Cloudflare connection could be injected for this identity.',
  agent_mismatch: 'The configured OneCLI agent ID and identifier do not identify the same agent.',
  account_mismatch: 'The authenticated Cloudflare account does not match the reviewed target.',
  approval_required: 'Apply requires the exact reviewed plan ID.',
  plan_changed: 'The profile, plan, or Wrangler configuration changed after review.',
  receipt_expired: 'The preflight receipt expired; run the check again.',
  receipt_mismatch: 'The preflight receipt does not match this deployment.',
  migration_failed: 'A database migration failed; inspect deployment status before retrying.',
  deploy_failed: 'Worker deployment failed; inspect deployment status before retrying.',
  operation_interrupted:
    'The operation was interrupted; obtain a fresh preflight receipt before retrying.',
  invalid_worker_url: 'The Worker URL must be HTTPS.',
  health_check_failed: 'The deployed Worker health check failed.'
};

export function safeMessage(code: string): string {
  return MESSAGES[code] ?? 'The deployment operation failed safely.';
}
