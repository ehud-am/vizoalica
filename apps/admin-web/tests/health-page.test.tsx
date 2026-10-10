// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App.js';
import { applyApiDefaults, blog, docs } from './fixtures/api.js';

const api = vi.hoisted(() => ({
  bootstrapSession: vi.fn(),
  listProjects: vi.fn(),
  listWebsites: vi.fn(),
  getStatus: vi.fn(),
  getReachability: vi.fn(),
  getAnalyticsOverview: vi.fn(),
  getBackendState: vi.fn()
}));
vi.mock('../src/api/local-operations.js', async (load) => ({ ...(await load()), ...api }));

const backend = {
  workerVersion: '0.7.2',
  consoleVersion: '0.7.3',
  schema: { applied: 12, expected: 12, appliedNames: [] },
  worker: { status: 'current', message: 'The Worker matches this console.' },
  schemaStatus: { status: 'current', message: 'The schema is current.' },
  health: { database: 'ok', storage: 'ok' },
  featuresAccessKeys: true
};

beforeEach(() => {
  applyApiDefaults(api, { p1: [docs, blog], p2: [] });
  api.getBackendState.mockResolvedValue(backend);
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const open = async (address = 'manage/health') => {
  window.location.hash = `#/${address}`;
  render(<App />);
  await screen.findByRole('heading', { level: 1, name: 'Health' });
};

describe('Health', () => {
  it('starts with the backend, marked as covering the whole environment, then the project’s websites', async () => {
    await open();
    const backendSection = await screen.findByRole('region', { name: 'Backend' });
    const websites = screen.getByRole('region', { name: /^Websites/ });
    // Backend first in the page.
    expect(
      backendSection.compareDocumentPosition(websites) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(within(backendSection).getByText(/whole environment/)).toBeTruthy();
    expect(websites.textContent).toContain('Acme');
    expect(within(websites).getByRole('link', { name: 'Docs' })).toBeTruthy();
  });

  it('shows the console, Worker and schema versions and the storage state', async () => {
    await open();
    const table = await screen.findByRole('table');
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows.map((row) => within(row).getAllByRole('cell')[0]!.textContent)).toEqual([
      '0.7.3',
      '0.7.2',
      '12'
    ]);
    expect(within(table).getAllByText('Up to date').length).toBeGreaterThan(0);
    const storage = screen.getByText('Database').closest('dl')!;
    expect(storage.textContent).toContain('ok');
  });

  it('is what the old Backend address shows, and Backend is not in the sidebar', async () => {
    await open('manage/backend');
    expect(await screen.findByRole('region', { name: 'Backend' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Backend' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Health' }).getAttribute('aria-current')).toBe('true');
  });

  it('still shows the backend when there is no project, and says the websites need one', async () => {
    api.listProjects.mockResolvedValue([]);
    await open();
    expect(await screen.findByRole('region', { name: 'Backend' })).toBeTruthy();
    expect(
      within(screen.getByRole('region', { name: /^Websites/ })).getByRole('link', {
        name: 'Create a project'
      })
    ).toBeTruthy();
  });

  it('says so when the backend cannot be reached, without hiding the websites', async () => {
    api.getBackendState.mockRejectedValue(new Error('offline'));
    await open();
    expect(
      (await screen.findByText('The backend could not be reached.')).getAttribute('role')
    ).toBe('alert');
    expect(screen.getByRole('link', { name: 'Docs' })).toBeTruthy();
  });

  it('reads and changes nothing about the backend', async () => {
    await open();
    await screen.findByRole('table');
    const main = document.querySelector('main')!;
    for (const name of [/update/i, /deploy/i, /rotate/i, /purge/i])
      expect(within(main).queryByRole('button', { name })).toBeNull();
  });
});
