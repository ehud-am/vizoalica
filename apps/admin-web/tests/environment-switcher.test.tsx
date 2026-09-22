// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EnvironmentSwitcher } from '../src/setup/EnvironmentSwitcher.js';
import * as api from '../src/api/local-operations.js';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('EnvironmentSwitcher', () => {
  it('renders nothing for a non-admin role', async () => {
    const list = vi.spyOn(api, 'listEnvironments');
    const { container } = render(<EnvironmentSwitcher role="analyst" onChanged={() => {}} />);
    await Promise.resolve();
    expect(container.firstChild).toBeNull();
    expect(list).not.toHaveBeenCalled();
  });

  it('renders nothing before the list has loaded, then shows only a small label for one environment', async () => {
    vi.spyOn(api, 'listEnvironments').mockResolvedValue({
      active: 'prod',
      environments: [{ name: 'prod', hasConnection: true, mode: 'file' }]
    });
    const { container } = render(<EnvironmentSwitcher role="admin" onChanged={() => {}} />);
    await waitFor(() => expect(screen.getByText('prod')).toBeTruthy());
    expect(container.querySelector('.environment-switcher-panel')).toBeNull();
  });

  it('shows a full switcher once more than one environment exists, and can switch', async () => {
    vi.spyOn(api, 'listEnvironments').mockResolvedValue({
      active: 'prod',
      environments: [
        { name: 'prod', hasConnection: true, mode: 'file' },
        { name: 'dev', hasConnection: true, mode: 'file' }
      ]
    });
    const select = vi.spyOn(api, 'selectEnvironment').mockResolvedValue({} as never);
    const onChanged = vi.fn();
    render(<EnvironmentSwitcher role="admin" onChanged={onChanged} />);
    await waitFor(() => expect(screen.getByText('prod', { selector: 'summary' })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'dev' }));
    await waitFor(() => expect(select).toHaveBeenCalledWith('dev'));
    expect(onChanged).toHaveBeenCalled();
  });

  it('creates a new environment after validating the name', async () => {
    vi.spyOn(api, 'listEnvironments').mockResolvedValue({
      active: 'prod',
      environments: [
        { name: 'prod', hasConnection: true, mode: 'file' },
        { name: 'dev', hasConnection: true, mode: 'file' }
      ]
    });
    const create = vi.spyOn(api, 'createEnvironment').mockResolvedValue({} as never);
    const onChanged = vi.fn();
    render(<EnvironmentSwitcher role="admin" onChanged={onChanged} />);
    await waitFor(() => expect(screen.getByText('prod', { selector: 'summary' })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'New environment' }));
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    expect(create).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toContain('lowercase');
    fireEvent.change(screen.getByLabelText('New environment name'), {
      target: { value: 'stage' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(create).toHaveBeenCalledWith('stage'));
    expect(onChanged).toHaveBeenCalled();
  });

  it('removes an environment after a named confirmation', async () => {
    vi.spyOn(api, 'listEnvironments').mockResolvedValue({
      active: 'prod',
      environments: [
        { name: 'prod', hasConnection: true, mode: 'file' },
        { name: 'dev', hasConnection: true, mode: 'file' }
      ]
    });
    const remove = vi.spyOn(api, 'removeEnvironment').mockResolvedValue({} as never);
    render(<EnvironmentSwitcher role="admin" onChanged={() => {}} />);
    await waitFor(() => expect(screen.getByText('prod', { selector: 'summary' })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Remove environment dev' }));
    expect(screen.getByRole('alertdialog').textContent).toContain('dev');
    expect(screen.getByRole('alertdialog').textContent).toContain('not');
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(remove).toHaveBeenCalledWith('dev'));
  });
});
