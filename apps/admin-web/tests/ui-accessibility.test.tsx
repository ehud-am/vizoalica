// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, render, screen } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App.js';
import { AccessState } from '../src/components/AccessState.js';
import { ThemeToggle } from '../src/components/ThemeToggle.js';

const css = readFileSync(join(process.cwd(), 'apps/admin-web/src/styles.css'), 'utf8');

const api = vi.hoisted(() => ({
  bootstrapSession: vi.fn(),
  listProjects: vi.fn(),
  listWebsites: vi.fn(),
  getAnalyticsOverview: vi.fn(),
  getThemePreference: vi.fn(),
  putThemePreference: vi.fn()
}));
vi.mock('../src/api/local-operations.js', async (load) => ({ ...(await load()), ...api }));

beforeEach(() => {
  api.bootstrapSession.mockResolvedValue(undefined);
  api.listProjects.mockResolvedValue([{ id: 'p1', name: 'Acme' }]);
  api.listWebsites.mockResolvedValue([]);
  api.getAnalyticsOverview.mockResolvedValue({
    scope: {
      projectId: 'p1',
      sourceId: null,
      label: 'All websites',
      identityMode: 'project-supplied'
    },
    range: {
      startUtc: '2026-01-01T00:00:00.000Z',
      endUtc: '2026-01-02T00:00:00.000Z',
      interval: 'hour',
      timezone: 'UTC'
    },
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
  api.putThemePreference.mockResolvedValue({
    theme: 'dark',
    updatedAt: '2026-01-01T00:00:00.000Z'
  });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('application shell landmarks and navigation state', () => {
  it('exposes header, primary navigation, and a focusable main landmark', async () => {
    render(<App />);
    expect(await screen.findByRole('banner')).toBeTruthy();
    expect(screen.getByRole('navigation', { name: 'Primary navigation' })).toBeTruthy();
    const main = document.querySelector('main');
    expect(main?.id).toBe('main');
    expect(main?.getAttribute('tabindex')).toBe('-1');
  });

  it('marks the active navigation item with aria-current="page"', async () => {
    render(<App />);
    const overview = await screen.findByRole('button', { name: 'Overview' });
    expect(overview.getAttribute('aria-current')).toBe('page');
    const websites = screen.getByRole('button', { name: 'Websites' });
    expect(websites.getAttribute('aria-current')).toBeNull();
  });
});

describe('error and status semantics', () => {
  it('marks a denied/offline access state with role="alert"', () => {
    const html = renderToStaticMarkup(<AccessState state="denied" onRetry={() => undefined} />);
    expect(html).toContain('role="alert"');
  });

  it('marks the loading access state as a polite live region rather than an alert', () => {
    const html = renderToStaticMarkup(<AccessState state="loading" onRetry={() => undefined} />);
    expect(html).toContain('aria-live="polite"');
    expect(html).not.toContain('role="alert"');
  });

  it('marks the theme save-failure notice as a polite status region', () => {
    const html = renderToStaticMarkup(
      <ThemeToggle theme="dark" saving={false} saveError onChange={() => undefined} />
    );
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('could not be saved');
  });
});

describe('focus visibility', () => {
  it('defines a visible focus outline for every interactive element type', () => {
    expect(css).toMatch(/button:focus-visible[\s\S]*?outline: 3px solid var\(--color-focus-ring\)/);
    expect(css).toContain('input:focus-visible');
    expect(css).toContain('select:focus-visible');
  });
});

describe('document-level security headers', () => {
  const indexHtml = readFileSync(join(process.cwd(), 'apps/admin-web/index.html'), 'utf8');

  it('declares a restrictive Content-Security-Policy via meta tag', () => {
    // A meta tag, not a server header or a Pages _headers file, because this console is always
    // served by `vite dev`/`vite preview` per docs/operations/local-analytics.md - there is no
    // Cloudflare Pages (or other) hosting layer that would read a _headers file for it.
    expect(indexHtml).toMatch(/http-equiv="Content-Security-Policy"/);
    expect(indexHtml).toContain("default-src 'self'");
    expect(indexHtml).toContain("script-src 'self'");
    expect(indexHtml).toContain("base-uri 'none'");
  });

  it('does not declare frame-ancestors or sandbox in the meta CSP (both are ignored there per spec)', () => {
    const cspContentMatch = /http-equiv="Content-Security-Policy"\s+content="([^"]+)"/.exec(
      indexHtml
    );
    expect(cspContentMatch).toBeTruthy();
    expect(cspContentMatch![1]).not.toContain('frame-ancestors');
    expect(cspContentMatch![1]).not.toContain('sandbox');
  });
});

describe('zoom-safe and narrow-viewport structure', () => {
  it('reflows the shell to a single column under 800 CSS pixels', () => {
    expect(css).toContain('@media (max-width: 800px)');
    expect(css).toMatch(/\.workspace\s*{\s*grid-template-columns: 1fr;\s*}/);
  });

  it('lets the main content column shrink instead of forcing a fixed width that would clip at 200% zoom', () => {
    expect(css).toMatch(/\.page\s*{[\s\S]*?max-width: 1120px;[\s\S]*?margin: 0 auto;/);
    expect(css).not.toContain('overflow-x: hidden');
    expect(css).toContain('min-width: 320px');
  });
});

describe('both-theme semantic tokens', () => {
  it('defines the full light token set on :root', () => {
    for (const token of [
      '--color-surface-page',
      '--color-surface-raised',
      '--color-text-primary',
      '--color-text-secondary',
      '--color-border-default',
      '--color-focus-ring',
      '--color-success-bg',
      '--color-warning-bg',
      '--color-danger-bg'
    ]) {
      expect(css).toContain(token);
    }
  });

  it('redefines every semantic token for both the system dark preference and an explicit dark choice', () => {
    const rootBlock = css.slice(
      css.indexOf(':root {'),
      css.indexOf('@media (prefers-color-scheme: dark)')
    );
    // The code-block tokens are a deliberate exception: pre/code stays a dark
    // panel in both themes for contrast, so it is intentionally not redefined.
    const themeInvariant = new Set(['--color-code-bg', '--color-code-text']);
    const lightTokens = [...rootBlock.matchAll(/--color-[a-z-]+(?=:)/g)]
      .map((match) => match[0])
      .filter((token) => !themeInvariant.has(token));
    expect(lightTokens.length).toBeGreaterThan(15);

    const systemDarkBlock = css.slice(
      css.indexOf('@media (prefers-color-scheme: dark)'),
      css.indexOf(":root[data-theme='dark']")
    );
    const explicitDarkBlock = css.slice(css.indexOf(":root[data-theme='dark']"));

    for (const token of lightTokens) {
      expect(systemDarkBlock, `${token} missing from system-dark override`).toContain(token);
      expect(explicitDarkBlock, `${token} missing from explicit dark override`).toContain(token);
    }
  });

  it('guards the system-dark override so an explicit light choice always wins', () => {
    expect(css).toContain(":root:not([data-theme='light'])");
  });

  it('sets color-scheme in both themes so native form controls render correctly', () => {
    expect(css).toMatch(/:root\s*{[\s\S]*?color-scheme: light;/);
    expect(css).toMatch(/:root\[data-theme='dark'\]\s*{[\s\S]*?color-scheme: dark;/);
  });
});
