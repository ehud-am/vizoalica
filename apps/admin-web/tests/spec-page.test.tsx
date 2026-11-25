// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
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
  getBackendState: vi.fn(),
  getSiteSpec: vi.fn()
}));
vi.mock('../src/api/local-operations.js', async (load) => ({ ...(await load()), ...api }));

beforeEach(() => {
  applyApiDefaults(api, { p1: [docs, blog], p2: [] });
  api.getBackendState.mockResolvedValue({});
  window.localStorage.setItem(
    'vizoalica.console.scope',
    JSON.stringify({ projectId: 'p1', websiteId: 's1' })
  );
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const open = async () => {
  window.location.hash = '#/manage/spec';
  render(<App />);
  await screen.findByRole('heading', { level: 1, name: 'Spec' });
};

describe('Spec page', () => {
  it('shows the latest spec in words with the way to change it', async () => {
    api.getSiteSpec.mockResolvedValue({
      version: 3,
      appliedAt: '2026-11-25T10:00:00Z',
      renderedMd: '# Docs\n\nPricing page'
    });
    await open();
    expect(await screen.findByText(/Version 3, applied 2026-11-25/)).toBeTruthy();
    expect(screen.getByText(/Pricing page/)).toBeTruthy();
    expect(screen.getByText(/vizoalica spec pull/)).toBeTruthy();
  });

  it('says how to create a spec when none exists, and reports a failure', async () => {
    api.getSiteSpec.mockResolvedValue({ version: 0 });
    await open();
    expect(await screen.findByText(/No spec yet/)).toBeTruthy();
    cleanup();
    api.getSiteSpec.mockRejectedValue(new Error('x'));
    await open();
    expect(await screen.findByText(/could not be loaded/)).toBeTruthy();
  });
});
