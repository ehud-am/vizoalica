// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { UpdatePanel } from '../src/manage/UpdatePanel.js';
import * as api from '../src/api/local-operations.js';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const NAMES = {
  worker: 'stage-vizoalica-worker',
  database: 'stage-vizoalica-db',
  bucket: 'stage-vizoalica-bucket'
};

const PLAN = {
  id: 'p1',
  mode: 'update-backend' as const,
  environment: 'stage',
  names: NAMES,
  resources: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  update: {
    worker: { current: '0.6.2', expected: '0.7.0', status: 'update-available', message: 'older' },
    schema: { applied: 1, expected: 2, status: 'update-available', message: 'behind' },
    pending: [
      { name: '0002_add_widgets.sql', description: 'adds the widgets table', nonAdditive: false }
    ]
  }
};

function stepRecord(id: string, label: string, status: 'pending' | 'running' | 'done' | 'failed') {
  return { id, label, status };
}

describe('UpdatePanel', () => {
  it('renders nothing when the backend is already up to date', async () => {
    vi.spyOn(api, 'getUpdatePreview').mockResolvedValue({
      environment: 'stage',
      worker: { current: '0.7.0', expected: '0.7.0', status: 'current', message: 'ok' },
      schema: { applied: 2, expected: 2, status: 'current', message: 'ok' },
      pending: [],
      upToDate: true
    });
    const { container } = render(<UpdatePanel onUpdated={() => {}} />);
    await waitFor(() => expect(api.getUpdatePreview).toHaveBeenCalled());
    expect(container.textContent).toBe('');
  });

  it('shows the plan only after approval, and never before', async () => {
    vi.spyOn(api, 'getUpdatePreview').mockResolvedValue({
      environment: 'stage',
      worker: PLAN.update.worker,
      schema: PLAN.update.schema,
      pending: PLAN.update.pending,
      upToDate: false
    });
    const createPlan = vi.spyOn(api, 'createUpdatePlan').mockResolvedValue(PLAN);
    render(<UpdatePanel onUpdated={() => {}} />);
    await screen.findByRole('heading', { name: /Update this environment/ });
    expect(screen.queryByRole('heading', { name: 'This update will' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Show the update plan' }));
    await screen.findByRole('heading', { name: 'This update will' });
    expect(createPlan).toHaveBeenCalled();
    expect(screen.getByText('adds the widgets table')).toBeTruthy();
  });

  it('polls progress and reports the versions once done', async () => {
    vi.spyOn(api, 'getUpdatePreview').mockResolvedValue({
      environment: 'stage',
      worker: PLAN.update.worker,
      schema: PLAN.update.schema,
      pending: PLAN.update.pending,
      upToDate: false
    });
    vi.spyOn(api, 'createUpdatePlan').mockResolvedValue(PLAN);
    const start = vi.spyOn(api, 'startUpdateRun').mockResolvedValue({
      id: 'r1',
      planId: 'p1',
      mode: 'update-backend',
      environment: 'stage',
      names: NAMES,
      status: 'running',
      steps: [stepRecord('migrate', 'Applying database changes', 'running')],
      createdAt: '2026-01-01T00:00:00.000Z'
    });
    const getRun = vi.spyOn(api, 'getDeployRun').mockResolvedValue({
      id: 'r1',
      planId: 'p1',
      mode: 'update-backend',
      environment: 'stage',
      names: NAMES,
      status: 'done',
      steps: [stepRecord('migrate', 'Applying database changes', 'done')],
      createdAt: '2026-01-01T00:00:00.000Z',
      versions: {
        before: { worker: '0.6.2', schema: 1 },
        after: { worker: '0.7.0', schema: 2 },
        migrationsApplied: ['0002_add_widgets.sql'],
        backupPath: '/home/.config/vizoalica/backups/stage-vizoalica-db-1.sql'
      }
    });
    const onUpdated = vi.fn();
    render(<UpdatePanel onUpdated={onUpdated} />);
    await screen.findByRole('button', { name: 'Show the update plan' });
    fireEvent.click(screen.getByRole('button', { name: 'Show the update plan' }));
    await screen.findByRole('button', { name: 'Approve and update' });
    fireEvent.click(screen.getByRole('button', { name: 'Approve and update' }));
    expect(start).toHaveBeenCalledWith('p1', false);
    await waitFor(() => expect(getRun).toHaveBeenCalled(), { timeout: 3000 });
    await screen.findByText(/0\.7\.0/);
    await waitFor(() => expect(onUpdated).toHaveBeenCalled());
  });

  it('offers resume on a failed step', async () => {
    vi.spyOn(api, 'getUpdatePreview').mockResolvedValue({
      environment: 'stage',
      worker: PLAN.update.worker,
      schema: PLAN.update.schema,
      pending: PLAN.update.pending,
      upToDate: false
    });
    vi.spyOn(api, 'createUpdatePlan').mockResolvedValue(PLAN);
    vi.spyOn(api, 'startUpdateRun').mockResolvedValue({
      id: 'r1',
      planId: 'p1',
      mode: 'update-backend',
      environment: 'stage',
      names: NAMES,
      status: 'failed',
      steps: [
        {
          ...stepRecord('migrate', 'Applying database changes', 'failed'),
          error: 'migration failed'
        }
      ],
      createdAt: '2026-01-01T00:00:00.000Z',
      error: 'migration failed'
    });
    const resume = vi.spyOn(api, 'resumeUpdateRun').mockResolvedValue({
      id: 'r1',
      planId: 'p1',
      mode: 'update-backend',
      environment: 'stage',
      names: NAMES,
      status: 'running',
      steps: [stepRecord('migrate', 'Applying database changes', 'running')],
      createdAt: '2026-01-01T00:00:00.000Z'
    });
    render(<UpdatePanel onUpdated={() => {}} />);
    await screen.findByRole('button', { name: 'Show the update plan' });
    fireEvent.click(screen.getByRole('button', { name: 'Show the update plan' }));
    await screen.findByRole('button', { name: 'Approve and update' });
    fireEvent.click(screen.getByRole('button', { name: 'Approve and update' }));
    await screen.findByRole('button', { name: 'Resume' });
    expect(screen.getByText('migration failed')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Resume' }));
    await waitFor(() => expect(resume).toHaveBeenCalledWith('r1'));
  });

  it('confirms and starts an update with the backup declined, for a purely additive change', async () => {
    vi.spyOn(api, 'getUpdatePreview').mockResolvedValue({
      environment: 'stage',
      worker: PLAN.update.worker,
      schema: PLAN.update.schema,
      pending: PLAN.update.pending,
      upToDate: false
    });
    vi.spyOn(api, 'createUpdatePlan').mockResolvedValue(PLAN);
    const start = vi.spyOn(api, 'startUpdateRun').mockResolvedValue({
      id: 'r1',
      planId: 'p1',
      mode: 'update-backend',
      environment: 'stage',
      names: NAMES,
      status: 'done',
      steps: [stepRecord('migrate', 'Applying database changes', 'done')],
      createdAt: '2026-01-01T00:00:00.000Z'
    });
    render(<UpdatePanel onUpdated={() => {}} />);
    await screen.findByRole('button', { name: 'Show the update plan' });
    fireEvent.click(screen.getByRole('button', { name: 'Show the update plan' }));
    await screen.findByRole('checkbox', { name: 'Skip the database backup' });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Skip the database backup' }));
    fireEvent.click(screen.getByRole('button', { name: 'Approve and update' }));
    await screen.findByRole('button', { name: 'Update without a backup' });
    fireEvent.click(screen.getByRole('button', { name: 'Update without a backup' }));
    await waitFor(() => expect(start).toHaveBeenCalledWith('p1', true));
  });

  it('reports an error when the plan, the run, or the resume call itself fails', async () => {
    vi.spyOn(api, 'getUpdatePreview').mockResolvedValue({
      environment: 'stage',
      worker: PLAN.update.worker,
      schema: PLAN.update.schema,
      pending: PLAN.update.pending,
      upToDate: false
    });
    vi.spyOn(api, 'createUpdatePlan').mockRejectedValue(new Error('boom'));
    render(<UpdatePanel onUpdated={() => {}} />);
    await screen.findByRole('button', { name: 'Show the update plan' });
    fireEvent.click(screen.getByRole('button', { name: 'Show the update plan' }));
    await screen.findByText('The update plan could not be created. Try again.');
  });

  it('confirms before skipping the backup, and refuses when a pending change is not purely additive', async () => {
    vi.spyOn(api, 'getUpdatePreview').mockResolvedValue({
      environment: 'stage',
      worker: PLAN.update.worker,
      schema: PLAN.update.schema,
      pending: [
        { name: '0003_drop_column.sql', description: 'drops an old column', nonAdditive: true }
      ],
      upToDate: false
    });
    vi.spyOn(api, 'createUpdatePlan').mockResolvedValue({
      ...PLAN,
      update: {
        ...PLAN.update,
        pending: [
          { name: '0003_drop_column.sql', description: 'drops an old column', nonAdditive: true }
        ]
      }
    });
    render(<UpdatePanel onUpdated={() => {}} />);
    await screen.findByRole('button', { name: 'Show the update plan' });
    fireEvent.click(screen.getByRole('button', { name: 'Show the update plan' }));
    await screen.findByRole('checkbox', { name: 'Skip the database backup' });
    expect(
      (screen.getByRole('checkbox', { name: 'Skip the database backup' }) as HTMLInputElement)
        .disabled
    ).toBe(true);
  });
});
