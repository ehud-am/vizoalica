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

  describe('when something stops a deploy from starting', () => {
    const BLOCKED: api.Issue = {
      code: 'ip_not_allowed',
      title: "Cloudflare blocked this computer's address",
      detail: 'The API token is limited to certain IP addresses. Cloudflare error 9109.',
      steps: [
        'Open the Cloudflare dashboard and edit the token.',
        'Add 203.0.113.9 under Client IP Address Filtering.',
        'Come back here and choose Check again (or Resume) — nothing is repeated.'
      ]
    };

    it('explains it with the steps, and carries on after Check again once fixed', async () => {
      const preflight = vi
        .spyOn(api, 'getDeployPreflight')
        .mockResolvedValueOnce({ ...PREFLIGHT, signedIn: false, accounts: [], issue: BLOCKED })
        .mockResolvedValue(PREFLIGHT);
      render(<DeployWizard onDeployed={() => {}} />);
      const panel = await screen.findByRole('alert');
      expect(within(panel).getByRole('heading', { name: BLOCKED.title })).toBeTruthy();
      expect(
        within(panel)
          .getAllByRole('listitem')
          .map((item) => item.textContent)
      ).toEqual(BLOCKED.steps);
      expect(screen.queryByRole('button', { name: 'Show the deployment plan' })).toBeNull();

      fireEvent.click(within(panel).getByRole('button', { name: 'Check again' }));
      await screen.findByRole('button', { name: 'Show the deployment plan' });
      expect(preflight).toHaveBeenCalledTimes(2);
    });

    it('stays on the explanation when the check still fails', async () => {
      vi.spyOn(api, 'getDeployPreflight').mockResolvedValue({
        ...PREFLIGHT,
        signedIn: false,
        accounts: [],
        issue: BLOCKED
      });
      render(<DeployWizard onDeployed={() => {}} />);
      fireEvent.click(await screen.findByRole('button', { name: 'Check again' }));
      await screen.findByRole('heading', { name: BLOCKED.title });
      expect(screen.queryByRole('button', { name: 'Show the deployment plan' })).toBeNull();
    });

    it('lets the admin save a missing credential right there, then checks again', async () => {
      const missing: api.Issue = {
        code: 'no_credential',
        title: 'This environment has no Cloudflare credential',
        detail: 'None is saved for this environment.',
        steps: ['Choose how to reach Cloudflare below and save it.', 'Then choose Check again.'],
        fix: 'credential'
      };
      vi.spyOn(api, 'listEnvironments').mockResolvedValue({
        active: 'stage',
        environments: [],
        onecliConfigured: false
      });
      const preflight = vi
        .spyOn(api, 'getDeployPreflight')
        .mockRejectedValueOnce(
          new api.ApiError('backend_deploy_unavailable', 409, undefined, missing)
        )
        .mockResolvedValue(PREFLIGHT);
      const save = vi
        .spyOn(api, 'setEnvironmentCloudflare')
        .mockResolvedValue({ active: 'stage', environments: [] });
      render(<DeployWizard onDeployed={() => {}} />);
      await screen.findByRole('heading', { name: missing.title });
      // Nothing to re-check until a credential exists, so only the form is offered.
      expect(screen.queryByRole('button', { name: 'Check again' })).toBeNull();

      fireEvent.change(screen.getByLabelText('API token'), { target: { value: 'cf-token' } });
      fireEvent.click(screen.getByRole('button', { name: 'Save and continue' }));
      await screen.findByRole('button', { name: 'Show the deployment plan' });
      expect(save).toHaveBeenCalledWith('stage', { mode: 'token', token: 'cf-token' });
      expect(preflight).toHaveBeenCalledTimes(2);
    });

    it('asks for the OneCLI settings when they are missing, and saves them', async () => {
      const missing: api.Issue = {
        code: 'onecli_settings_missing',
        title: 'OneCLI settings are missing on this computer',
        detail: 'No project, agent, or gateway is saved.',
        steps: ['Enter them below.', 'Then choose Check again.'],
        fix: 'credential'
      };
      vi.spyOn(api, 'listEnvironments').mockResolvedValue({
        active: 'stage',
        environments: [],
        onecliConfigured: false
      });
      vi.spyOn(api, 'getDeployPreflight')
        .mockRejectedValueOnce(
          new api.ApiError('onecli_settings_not_found', 409, undefined, missing)
        )
        .mockResolvedValue(PREFLIGHT);
      const save = vi
        .spyOn(api, 'setEnvironmentCloudflare')
        .mockResolvedValue({ active: 'stage', environments: [] });
      render(<DeployWizard onDeployed={() => {}} />);
      await screen.findByRole('heading', { name: missing.title });
      fireEvent.click(screen.getByRole('button', { name: /OneCLI/ }));
      fireEvent.change(screen.getByLabelText('OneCLI project'), { target: { value: 'harness' } });
      fireEvent.change(screen.getByLabelText('OneCLI agent'), {
        target: { value: 'vizoalica-deploy' }
      });
      fireEvent.click(screen.getByRole('button', { name: 'Save and continue' }));
      await screen.findByRole('button', { name: 'Show the deployment plan' });
      expect(save).toHaveBeenCalledWith('stage', {
        mode: 'onecli',
        onecli: { project: 'harness', agent: 'vizoalica-deploy', gateway: '127.0.0.1:10255' }
      });
    });

    it('keeps the raw error and a Check again when the failure is not recognized', async () => {
      vi.spyOn(api, 'getDeployPreflight').mockRejectedValue(new Error('offline'));
      render(<DeployWizard onDeployed={() => {}} />);
      await screen.findByText(/could not be reached/);
      expect(screen.getByRole('button', { name: 'Check again' })).toBeTruthy();
    });
  });

  describe('when a step stops partway', () => {
    const STOPPED: api.Issue = {
      code: 'permission_missing',
      title: 'The API token is missing a permission',
      detail: 'It needs: Account → Workers R2 Storage → Edit.',
      steps: [
        'Edit the token in the Cloudflare dashboard.',
        'Add Account → Workers R2 Storage → Edit.',
        'Come back here and choose Check again (or Resume) — nothing is repeated.'
      ]
    };
    const failedRun = (issue: api.Issue): api.DeployRun => ({
      id: 'r1',
      planId: 'p1',
      mode: 'first-install',
      environment: 'stage',
      names: PREFLIGHT.names,
      status: 'failed',
      steps: [
        { id: 'create-database', label: 'Creating the database', status: 'done' },
        {
          id: 'create-bucket',
          label: 'Creating the storage bucket',
          status: 'failed',
          error: 'Authentication error [code: 10000]',
          issue
        }
      ],
      createdAt: '2026-01-01T00:00:00.000Z',
      error: 'Authentication error [code: 10000]',
      issue
    });

    async function reachFailure(run: api.DeployRun) {
      vi.spyOn(api, 'getDeployPreflight').mockResolvedValue(PREFLIGHT);
      vi.spyOn(api, 'createDeployPlan').mockResolvedValue(PLAN);
      vi.spyOn(api, 'startDeployRun').mockResolvedValue(run);
      render(<DeployWizard onDeployed={() => {}} />);
      fireEvent.click(await screen.findByRole('button', { name: 'Show the deployment plan' }));
      fireEvent.click(await screen.findByRole('button', { name: 'Approve and deploy' }));
    }

    it('names the failed step, explains it with steps, and resumes from that step', async () => {
      await reachFailure(failedRun(STOPPED));
      const panel = await screen.findByRole('alert', { name: STOPPED.title });
      expect(
        within(panel)
          .getAllByRole('listitem')
          .map((item) => item.textContent)
      ).toEqual(STOPPED.steps);
      // The raw output stays available, but is not the message.
      expect(screen.getByText('Technical details')).toBeTruthy();
      const resumed = { ...failedRun(STOPPED), status: 'done' as const, steps: [] };
      const resume = vi.spyOn(api, 'resumeDeployRun').mockResolvedValue(resumed);
      fireEvent.click(
        within(panel).getByRole('button', { name: 'Resume from “Creating the storage bucket”' })
      );
      await waitFor(() => expect(resume).toHaveBeenCalledWith('r1'));
    });

    it('still offers cleanup beside the explanation', async () => {
      await reachFailure(failedRun(STOPPED));
      await screen.findByRole('alert', { name: STOPPED.title });
      fireEvent.click(screen.getByRole('button', { name: 'Clean up…' }));
      expect(screen.getByRole('alertdialog').textContent).toContain('stage-vizoalica-db');
    });

    it('changes the credential in place, then resumes the same run', async () => {
      const invalid: api.Issue = {
        code: 'token_invalid',
        title: 'Cloudflare does not accept this API token',
        detail: 'The token is unknown or expired.',
        steps: ['Check the token.', 'Come back here and choose Check again (or Resume).'],
        fix: 'credential'
      };
      await reachFailure(failedRun(invalid));
      await screen.findByRole('alert', { name: invalid.title });
      const save = vi
        .spyOn(api, 'setEnvironmentCloudflare')
        .mockResolvedValue({ active: 'stage', environments: [] });
      const resume = vi
        .spyOn(api, 'resumeDeployRun')
        .mockResolvedValue({ ...failedRun(invalid), status: 'running' });
      fireEvent.change(screen.getByLabelText('API token'), { target: { value: 'cf-new' } });
      fireEvent.click(screen.getByRole('button', { name: 'Save and continue' }));
      await waitFor(() => expect(resume).toHaveBeenCalledWith('r1'));
      expect(save).toHaveBeenCalledWith('stage', { mode: 'token', token: 'cf-new' });
    });

    it('explains a resume that cannot start, instead of a generic failure', async () => {
      await reachFailure(failedRun(STOPPED));
      const panel = await screen.findByRole('alert', { name: STOPPED.title });
      const blocked: api.Issue = {
        code: 'no_credential',
        title: 'This environment has no Cloudflare credential',
        detail: 'None is saved.',
        steps: ['Save one below.', 'Then resume.'],
        fix: 'credential'
      };
      vi.spyOn(api, 'listEnvironments').mockResolvedValue({ active: 'stage', environments: [] });
      vi.spyOn(api, 'resumeDeployRun').mockRejectedValue(
        new api.ApiError('backend_deploy_unavailable', 409, undefined, blocked)
      );
      fireEvent.click(
        within(panel).getByRole('button', { name: 'Resume from “Creating the storage bucket”' })
      );
      await screen.findByRole('alert', { name: blocked.title });
    });
  });
});
