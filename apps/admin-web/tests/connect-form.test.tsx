// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConnectForm } from '../src/setup/ConnectForm.js';
import * as api from '../src/api/local-operations.js';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const STATE = {
  version: '0.7.0',
  needsFirstRun: false,
  connection: { status: 'connected' },
  stages: []
};

describe('ConnectForm (website owner)', () => {
  it('parses a pasted setup-details JSON blob into the address and key', async () => {
    const connect = vi.spyOn(api, 'connectBackend').mockResolvedValue(STATE as never);
    render(<ConnectForm role="website-owner" onConnected={() => {}} />);
    fireEvent.change(screen.getByLabelText('Setup details'), {
      target: { value: JSON.stringify({ workerUrl: 'https://w.test', readKey: 'vzk_key' }) }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
    await waitFor(() =>
      expect(connect).toHaveBeenCalledWith({
        workerUrl: 'https://w.test',
        credential: 'vzk_key',
        roleHint: 'website-owner'
      })
    );
  });

  it('treats non-JSON pasted text as a bare key, with no address', async () => {
    const connect = vi.spyOn(api, 'connectBackend').mockResolvedValue(STATE as never);
    render(<ConnectForm role="website-owner" onConnected={() => {}} />);
    fireEvent.change(screen.getByLabelText('Setup details'), { target: { value: 'vzk_bare_key' } });
    // No address yet, so submit stays disabled.
    expect((screen.getByRole('button', { name: 'Connect' }) as HTMLButtonElement).disabled).toBe(
      true
    );
    expect(connect).not.toHaveBeenCalled();
  });

  it('switches to manual entry and back', async () => {
    render(<ConnectForm role="website-owner" onConnected={() => {}} />);
    expect(screen.getByLabelText('Setup details')).toBeTruthy();
    fireEvent.click(
      screen.getByRole('button', { name: 'Enter the address and key manually instead' })
    );
    expect(screen.getByLabelText('Backend address')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Paste or upload setup details instead' }));
    expect(screen.getByLabelText('Setup details')).toBeTruthy();
  });

  it('reads an uploaded file the same way as a paste', async () => {
    render(<ConnectForm role="website-owner" onConnected={() => {}} />);
    const file = new File(
      [JSON.stringify({ workerUrl: 'https://w.test', readKey: 'vzk_key' })],
      'setup.json',
      { type: 'application/json' }
    );
    fireEvent.change(screen.getByLabelText('Or upload the file'), { target: { files: [file] } });
    await waitFor(() =>
      expect((screen.getByLabelText('Setup details') as HTMLTextAreaElement).value).toContain(
        'vzk_key'
      )
    );
  });
});

describe('ConnectForm (admin)', () => {
  it('never submits twice while a connection attempt is in flight', async () => {
    let resolveConnect: (value: unknown) => void = () => {};
    const connect = vi
      .spyOn(api, 'connectBackend')
      .mockReturnValue(new Promise((resolve) => (resolveConnect = resolve)) as never);
    render(<ConnectForm role="admin" onConnected={() => {}} />);
    fireEvent.change(screen.getByLabelText('Backend address'), {
      target: { value: 'https://w.test' }
    });
    fireEvent.change(screen.getByLabelText('Administrator secret'), {
      target: { value: 'the-secret' }
    });
    const button = screen.getByRole('button', { name: 'Connect' });
    fireEvent.click(button);
    fireEvent.click(button);
    fireEvent.submit(button.closest('form')!);
    expect(connect).toHaveBeenCalledTimes(1);
    resolveConnect(STATE);
  });
});
