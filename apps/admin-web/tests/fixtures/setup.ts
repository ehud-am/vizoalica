import type { SetupState, Stage, ViewRole } from '../../src/api/local-operations.js';

const stages = (
  statuses: Array<Stage['status']>,
  next?: Stage['next'],
  at = statuses.findIndex((status) => status === 'current' || status === 'blocked')
): Stage[] => {
  const ids = ['console', 'backend', 'website', 'data'] as const;
  const labels = ['Console running', 'Backend connected', 'Website configured', 'Data arriving'];
  return ids.map((id, index) => ({
    id,
    label: labels[index]!,
    status: statuses[index]!,
    ...(index === at && next ? { next } : {})
  }));
};

export const DONE: Array<Stage['status']> = ['done', 'done', 'done', 'done'];

export function connectedState(
  role: ViewRole = 'admin',
  overrides: Partial<SetupState> = {}
): SetupState {
  return {
    version: '0.6.3',
    needsFirstRun: false,
    connection: { status: 'connected', workerHost: 'w.example.workers.dev', mode: 'file' },
    principal: {
      role,
      scope: { projectId: null, sourceId: null },
      keyLabel: role === 'admin' ? null : 'Jane',
      features: { accessKeys: true, versions: true }
    },
    backend: {
      workerVersion: '0.6.3',
      schema: { applied: 1, expected: 1 },
      worker: { status: 'current', message: 'The Worker matches this console.', update: null },
      schemaStatus: {
        status: 'current',
        message: 'The database schema is up to date.',
        update: null
      },
      message: 'The database schema is up to date.'
    },
    stages: stages(DONE),
    ...overrides
  };
}

export const firstRunState = (overrides: Partial<SetupState> = {}): SetupState => ({
  version: '0.6.3',
  needsFirstRun: true,
  connection: { status: 'none' },
  stages: stages(['done', 'current', 'todo', 'todo'], {
    id: 'connect-backend',
    label: 'Deploy or connect a backend',
    href: '#/setup'
  }),
  ...overrides
});

export { stages };
