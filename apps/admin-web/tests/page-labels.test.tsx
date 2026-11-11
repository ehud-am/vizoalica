// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App.js';
import { applyApiDefaults, docs } from './fixtures/api.js';
import { makeOverview } from './fixtures/console.js';

const api = vi.hoisted(() => ({
  bootstrapSession: vi.fn(),
  listProjects: vi.fn(),
  listWebsites: vi.fn(),
  getSnippet: vi.fn(),
  getStatus: vi.fn(),
  getReachability: vi.fn(),
  getAnalyticsOverview: vi.fn(),
  getExcludedHits: vi.fn(),
  getSetupState: vi.fn(),
  getPageLabels: vi.fn()
}));
vi.mock('../src/api/local-operations.js', async (load) => ({ ...(await load()), ...api }));

beforeEach(() => {
  applyApiDefaults(api, { p1: [docs] });
  const overview = makeOverview();
  api.getAnalyticsOverview.mockResolvedValue({
    ...overview,
    rankings: {
      ...overview.rankings,
      pagePaths: { items: [{ label: '/', count: 5 }], otherCount: 0, total: 5 }
    }
  });
  api.getSetupState.mockRejectedValue(new Error('offline'));
  api.getExcludedHits.mockResolvedValue({ total: 0, days: [], windowDays: 30 });
  window.localStorage.setItem(
    'vizoalica.console.scope',
    JSON.stringify({ projectId: 'p1', websiteId: 's1' })
  );
  window.location.hash = '#/analytics/pages';
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  window.location.hash = '';
});

describe('page names in the console', () => {
  it('shows a page’s name with its key and group, and the key alone when it has none', async () => {
    api.getPageLabels.mockResolvedValue([{ key: '/', name: 'Home', group: 'Marketing' }]);
    render(<App />);
    expect(await screen.findByText('Home')).toBeTruthy();
    expect(screen.getByText(/\/ · Marketing/)).toBeTruthy();
    expect(api.getPageLabels).toHaveBeenCalledWith('p1', 's1', expect.anything());
  });

  it('falls back to keys when the names cannot be loaded', async () => {
    api.getPageLabels.mockRejectedValue(new Error('not found'));
    render(<App />);
    await waitFor(() => expect(api.getPageLabels).toHaveBeenCalled());
    expect(screen.queryByText('Home')).toBeNull();
    expect((await screen.findAllByText('/')).length).toBeGreaterThan(0);
  });
});
