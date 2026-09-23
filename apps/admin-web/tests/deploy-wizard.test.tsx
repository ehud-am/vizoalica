// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DeployWizard } from '../src/manage/DeployWizard.js';
import * as api from '../src/api/local-operations.js';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const PREFLIGHT = {
  environment: 'stage',
  names: {
    worker: 'stage-vizoalica-worker',
    database: 'stage-vizoalica-db',
    bucket: 'stage-vizoalica-bucket'
  },
  signedIn: true,
  accounts: [{ id: 'a'.repeat(32), name: 'Acme' }],
  existing: { database: false, bucket: false }
};

const PLAN = {
  id: 'p1',
  mode: 'first-install' as const,
  environment: 'stage',
  names: PREFLIGHT.names,
  resources: [
    { kind: 'd1' as const, name: 'stage-vizoalica-db', purpose: 'Stores aggregates.' },
    { kind: 'r2' as const, name: 'stage-vizoalica-bucket', purpose: 'Stores raw batches.' },
    { kind: 'worker' as const, name: 'stage-vizoalica-worker', purpose: 'Serves the admin API.' }
  ],
  createdAt: '2026-01-01T00:00:00.000Z'
};

function stepRecord(status: 'pending' | 'running' | 'done' | 'failed') {
  return { id: 'deploy-worker', label: 'Deploying the Worker', status };
}

describe('DeployWizard', () => {
  it('shows the plan only after approval, and never before', async () => {
    vi.spyOn(api, 'getDeployPreflight').mockResolvedValue(PREFLIGHT);
    const createPlan = vi.spyOn(api, 'createDeployPlan').mockResolvedValue(PLAN);
    render(<DeployWizard onDeployed={() => {}} />);
    await screen.findByRole('heading', { name: /Deploy this environment/ });
    expect(screen.queryByRole('heading', { name: 'This will create' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Show the deployment plan' }));
    await screen.findByRole('heading', { name: 'This will create' });
    expect(createPlan).toHaveBeenCalled();
    expect(screen.getByText('stage-vizoalica-worker')).toBeTruthy();
  });

  it('refuses to plan when a same-named resource already exists', async () => {
    vi.spyOn(api, 'getDeployPreflight').mockResolvedValue({
      ...PREFLIGHT,
      existing: { database: true, bucket: false }
    });
    render(<DeployWizard onDeployed={() => {}} />);
    await screen.findByRole('heading', { name: /Deploy this environment/ });
    expect(
      (screen.getByRole('button', { name: 'Show the deployment plan' }) as HTMLButtonElement)
        .disabled
    ).toBe(true);
    expect(screen.getByRole('alert').textContent).toContain('stage-vizoalica-db');
  });

  it('creates nothing before approval, then polls progress and shows the result once done', async () => {
    vi.spyOn(api, 'getDeployPreflight').mockResolvedValue(PREFLIGHT);
    vi.spyOn(api, 'createDeployPlan').mockResolvedValue(PLAN);
    const start = vi.spyOn(api, 'startDeployRun').mockResolvedValue({
      id: 'r1',
      planId: 'p1',
      mode: 'first-install',
      environment: 'stage',
      names: PREFLIGHT.names,
      status: 'running',
      steps: [stepRecord('running')],
      createdAt: '2026-01-01T00:00:00.000Z'
    });
    const getRun = vi.spyOn(api, 'getDeployRun').mockResolvedValue({
      id: 'r1',
      planId: 'p1',
      mode: 'first-install',
      environment: 'stage',
      names: PREFLIGHT.names,
      status: 'done',
      steps: [stepRecord('done')],
      createdAt: '2026-01-01T00:00:00.000Z',
      result: { workerUrl: 'https://stage-vizoalica-worker.example.workers.dev', healthy: true },
      canReveal: false
    });
    render(<DeployWizard onDeployed={() => {}} />);
    await screen.findByRole('button', { name: 'Show the deployment plan' });
    fireEvent.click(screen.getByRole('button', { name: 'Show the deployment plan' }));
    await screen.findByRole('button', { name: 'Approve and deploy' });
    fireEvent.click(screen.getByRole('button', { name: 'Approve and deploy' }));
    expect(start).toHaveBeenCalledWith('p1');
    await waitFor(() => expect(getRun).toHaveBeenCalled(), { timeout: 3000 });
    await screen.findByText(/stage-vizoalica-worker\.example\.workers\.dev/);
  });

  it('offers resume and a named cleanup confirmation on a failed run', async () => {
    vi.spyOn(api, 'getDeployPreflight').mockResolvedValue(PREFLIGHT);
    vi.spyOn(api, 'createDeployPlan').mockResolvedValue(PLAN);
    vi.spyOn(api, 'startDeployRun').mockResolvedValue({
      id: 'r1',
      planId: 'p1',
      mode: 'first-install',
      environment: 'stage',
      names: PREFLIGHT.names,
      status: 'failed',
      steps: [{ ...stepRecord('failed'), error: 'deploy failed' }],
      createdAt: '2026-01-01T00:00:00.000Z',
      error: 'deploy failed'
    });
    const cleanupRun = vi.spyOn(api, 'cleanupDeployRun').mockResolvedValue({ removed: [] });
    render(<DeployWizard onDeployed={() => {}} />);
    await screen.findByRole('button', { name: 'Show the deployment plan' });
    fireEvent.click(screen.getByRole('button', { name: 'Show the deployment plan' }));
    await screen.findByRole('button', { name: 'Approve and deploy' });
    fireEvent.click(screen.getByRole('button', { name: 'Approve and deploy' }));
    await screen.findByRole('button', { name: 'Resume' });
    expect(screen.getByText('deploy failed')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Clean up…' }));
    const dialog = screen.getByRole('alertdialog');
    expect(dialog.textContent).toContain('stage-vizoalica-db');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(cleanupRun).toHaveBeenCalledWith('r1'));
  });

  it('reveals generated secrets once and calls onDeployed after acknowledging them', async () => {
    vi.spyOn(api, 'getDeployPreflight').mockResolvedValue(PREFLIGHT);
    vi.spyOn(api, 'createDeployPlan').mockResolvedValue(PLAN);
    vi.spyOn(api, 'startDeployRun').mockResolvedValue({
      id: 'r1',
      planId: 'p1',
      mode: 'first-install',
      environment: 'stage',
      names: PREFLIGHT.names,
      status: 'done',
      steps: [stepRecord('done')],
      createdAt: '2026-01-01T00:00:00.000Z',
      result: { workerUrl: 'https://w.workers.dev' },
      canReveal: true
    });
    const reveal = vi
      .spyOn(api, 'revealDeploySecrets')
      .mockResolvedValue({ secrets: { VIZOALICA_ADMIN_SECRET: 'top-secret-value' } });
    const onDeployed = vi.fn();
    render(<DeployWizard onDeployed={onDeployed} />);
    await screen.findByRole('button', { name: 'Show the deployment plan' });
    fireEvent.click(screen.getByRole('button', { name: 'Show the deployment plan' }));
    await screen.findByRole('button', { name: 'Approve and deploy' });
    fireEvent.click(screen.getByRole('button', { name: 'Approve and deploy' }));
    await screen.findByRole('button', { name: 'Show the generated secrets' });
    fireEvent.click(screen.getByRole('button', { name: 'Show the generated secrets' }));
    await waitFor(() => expect(reveal).toHaveBeenCalledWith('r1'));
    await screen.findByText('top-secret-value');
    fireEvent.click(screen.getByRole('button', { name: 'I have saved them' }));
    expect(onDeployed).toHaveBeenCalled();
    expect(screen.queryByText('top-secret-value')).toBeNull();
  });

  it('says plainly when this environment’s credential is not recognized', async () => {
    vi.spyOn(api, 'getDeployPreflight').mockResolvedValue({
      ...PREFLIGHT,
      signedIn: false,
      accounts: []
    });
    render(<DeployWizard onDeployed={() => {}} />);
    await screen.findByRole('alert');
    expect(screen.getByRole('alert').textContent).toContain('did not recognize');
  });
});
