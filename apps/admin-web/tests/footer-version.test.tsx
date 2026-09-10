// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppFooter } from '../src/components/AppFooter.js';
import { App } from '../src/App.js';

const api = vi.hoisted(() => ({
  bootstrapSession: vi.fn(),
  listProjects: vi.fn(),
  listWebsites: vi.fn(),
  getAnalyticsOverview: vi.fn(),
  getThemePreference: vi.fn(),
  putThemePreference: vi.fn()
}));
vi.mock('../src/api/local-operations.js', async (load) => ({ ...(await load()), ...api }));

const rootPackageJson = JSON.parse(
  readFileSync(join(process.cwd(), 'package.json'), 'utf8')
) as { version: string };

beforeEach(() => {
  vi.stubGlobal('__VIZOALICA_VERSION__', rootPackageJson.version);
  api.bootstrapSession.mockResolvedValue(undefined);
  api.listProjects.mockResolvedValue([{ id: 'p1', name: 'Acme' }]);
  api.listWebsites.mockResolvedValue([]);
  api.getAnalyticsOverview.mockResolvedValue({
    scope: { projectId: 'p1', sourceId: null, label: 'All websites', identityMode: 'project-supplied' },
    range: { startUtc: '2026-01-01T00:00:00.000Z', endUtc: '2026-01-02T00:00:00.000Z', interval: 'hour', timezone: 'UTC' },
    totals: { pageViews: 0, uniqueUsers: 0 },
    trend: [],
    rankings: {
      pagePaths: { items: [], otherCount: 0, total: 0 },
      countries: { items: [], otherCount: 0, total: 0 },
      userAgents: { items: [], otherCount: 0, total: 0 },
      referrers: { items: [], otherCount: 0, total: 0 }
    },
    distributions: {
      operatingSystems: { items: [], total: 0 },
      browsers: { items: [], total: 0 },
      devices: { items: [], total: 0 },
      traffic: { items: [], total: 0 }
    },
    availability: { state: 'complete', taxonomyVersions: [1] }
  });
  api.getThemePreference.mockResolvedValue({ theme: null });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('AppFooter on every console view', () => {
  it('renders the versioned footer on Overview', async () => {
    render(<App />);
    expect(await screen.findByText(new RegExp(`Vizoalica \\| v${rootPackageJson.version}`))).toBeTruthy();
  });

  it('renders the versioned footer on Websites too', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Websites' }));
    expect(await screen.findByText(new RegExp(`Vizoalica \\| v${rootPackageJson.version}`))).toBeTruthy();
  });
});

describe('AppFooter version', () => {
  it('renders the authoritative root package.json version', () => {
    vi.stubGlobal('__VIZOALICA_VERSION__', rootPackageJson.version);
    const html = renderToStaticMarkup(<AppFooter />);
    expect(html).toContain(`v${rootPackageJson.version}`);
  });

  it('renders the exact "YYYY | Vizoalica | vX.Y.Z" format', () => {
    vi.stubGlobal('__VIZOALICA_VERSION__', '0.3.1');
    const html = renderToStaticMarkup(<AppFooter />);
    const year = new Date().getFullYear();
    expect(html).toContain(`${year} | Vizoalica | v0.3.1`);
  });

  it('falls back to "vunknown" when the build-time version constant is unavailable', () => {
    vi.unstubAllGlobals();
    const html = renderToStaticMarkup(<AppFooter />);
    expect(html).toContain('vunknown');
  });
});
