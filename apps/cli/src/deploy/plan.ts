import { assertEnvironmentName, defaultNames } from '@vizoalica/ops-core';

export type DeployNames = { worker: string; database: string; bucket: string };
export type DeployPlan = {
  environment: string;
  names: DeployNames;
  accountId?: string;
  resources: Array<{ kind: 'D1 database' | 'R2 bucket' | 'Worker'; name: string; purpose: string }>;
};

/** The resources one environment gets; every name carries the environment's prefix. */
export function buildPlan(environment: string, accountId?: string): DeployPlan {
  assertEnvironmentName(environment);
  const names = defaultNames(environment);
  return {
    environment,
    names,
    ...(accountId ? { accountId } : {}),
    resources: [
      {
        kind: 'D1 database',
        name: names.database,
        purpose: 'Stores bounded aggregates and configuration; never raw events.'
      },
      {
        kind: 'R2 bucket',
        name: names.bucket,
        purpose: 'Stores raw event batches, privacy-filtered before they arrive.'
      },
      {
        kind: 'Worker',
        name: names.worker,
        purpose: 'Validates events, enforces the privacy guard, and serves the admin API.'
      }
    ]
  };
}

export function describePlan(plan: DeployPlan): string {
  return [
    `Environment "${plan.environment}" will get:`,
    ...plan.resources.map(
      (resource) =>
        `  ${resource.kind.padEnd(12)} ${resource.name}\n               ${resource.purpose}`
    ),
    'Three secrets are generated. Nothing that already exists is changed or deleted.'
  ].join('\n');
}

export function describeUpdate(plan: DeployPlan, version: string): string {
  return [
    `Environment "${plan.environment}" will be updated to ${version}:`,
    `  Worker       ${plan.names.worker}   gets this version`,
    `  D1 database  ${plan.names.database}   gets the database changes it has not had yet`,
    `  R2 bucket    ${plan.names.bucket}   unchanged`,
    'Data and secrets are kept; a secret the Worker is missing is generated. Nothing is deleted.'
  ].join('\n');
}
