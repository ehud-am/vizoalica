export type ProviderName = 'onecli' | 'cloudflare-native';

export interface OneCliReference {
  project: string;
  agentId: string;
  agentIdentifier: string;
  connectionId: string;
}

export interface DeploymentProfile {
  schemaVersion: 1;
  provider: ProviderName;
  environment: string;
  wranglerConfigPath: string;
  cloudflare: { accountId: string };
  onecli?: OneCliReference;
  auditRetentionDays: number;
  analyticsDigestPath?: string;
}

export type OperationId =
  | 'cloudflare.identity.read'
  | 'd1.database.read'
  | 'r2.bucket.read'
  | 'worker.secrets.read'
  | 'worker.analytics_digest_secret.put'
  | 'worker.bundle.dry_run'
  | 'd1.migrations.apply'
  | 'worker.deploy'
  | 'worker.health.verify';

export interface WranglerTarget {
  workerName: string;
  databaseName: string;
  databaseId: string;
  bucketName: string;
  demoMode: boolean;
}

export interface PlannedOperation {
  id: OperationId;
  resource: string;
  mutation: boolean;
  approval: 'none' | 'deployment' | 'distinct';
}

export interface DeploymentPlan {
  schemaVersion: 1;
  planId: string;
  profileDigest: string;
  wranglerConfigDigest: string;
  createdAt: string;
  provider: ProviderName;
  environment: string;
  accountId: string;
  connectionId?: string;
  operations: PlannedOperation[];
}

export interface PreflightReceipt {
  schemaVersion: 1;
  receiptId: string;
  planId: string;
  profileDigest: string;
  wranglerConfigDigest: string;
  provider: ProviderName;
  actorId: string;
  accountId: string;
  connectionId?: string;
  issuedAt: string;
  expiresAt: string;
}

export type HealthStatus =
  | 'ready'
  | 'missing_connection'
  | 'denied'
  | 'revoked'
  | 'account_mismatch'
  | 'insufficient_permission'
  | 'provider_unavailable'
  | 'cloudflare_unavailable'
  | 'ambiguous_connection';

export interface CredentialHealth {
  status: HealthStatus;
  provider: ProviderName;
  accountId?: string;
  connectionId?: string;
  agentId?: string;
  checkedAt: string;
  remediation?: Remediation;
}

export type CommandName = 'configure' | 'plan' | 'check' | 'apply' | 'verify' | 'status';
export type ResultStatus = 'succeeded' | 'failed' | 'denied' | 'interrupted' | 'expired';
export type Remediation =
  | 'connect'
  | 'attach'
  | 'reauthorize'
  | 'correct_account'
  | 'narrow_ambiguity'
  | 'retry'
  | 'review';

export interface SafeError {
  code: string;
  message: string;
  remediation?: Remediation;
  retrySafe: boolean;
}

export interface DeploymentResult {
  schemaVersion: 1;
  ok: boolean;
  command: CommandName;
  status: ResultStatus;
  occurredAt: string;
  planId?: string;
  completedOperations: OperationId[];
  pendingOperations: OperationId[];
  error?: SafeError;
  details?: Record<string, string | number | boolean | string[]>;
}

export interface AuditRecord {
  eventId: string;
  occurredAt: string;
  actorId: string;
  provider: ProviderName;
  environment: string;
  accountId: string;
  connectionId?: string;
  planId?: string;
  action: 'configure' | 'plan' | 'preflight' | 'apply' | 'verify' | 'deny' | 'interrupt';
  outcome: ResultStatus;
  errorCode?: string;
  completedOperations?: OperationId[];
  pendingOperations?: OperationId[];
}

export interface ProcessRequest {
  executable: string;
  args: readonly string[];
  cwd: string;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
  signal?: AbortSignal;
  stdin?: string;
}

export interface ProcessResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  interrupted: boolean;
}

export type ProcessExecutor = (request: ProcessRequest) => Promise<ProcessResult>;

export class DeploymentFailure extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly exitCode: number,
    readonly remediation: Remediation | undefined = undefined,
    readonly retrySafe = false
  ) {
    super(message);
    this.name = 'DeploymentFailure';
  }
}
