// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ScopeProvider, useScope, type ScopeValue } from '../src/scope/ScopeProvider.js';

const api = vi.hoisted(() => ({ listWebsites: vi.fn() }));
vi.mock('../src/api/local-operations.js', async (load) => ({ ...(await load()), ...api }));

const KEY = 'vizoalica.console.scope';
const acme = { id: 'p1', name: 'Acme' };
const beta = { id: 'p2', name: 'Beta' };
const docs = {
  id: 's1',
  projectId: 'p1',
  name: 'Docs',
  publicSourceKey: 'k',
  allowedOrigins: ['https://docs.test'],
  status: 'active' as const
};

let scope: ScopeValue;
function Probe() {
  scope = useScope();
  return (
    <p>
      {scope.projectId}|{scope.websiteId}|{scope.notice}
    </p>
  );
}
const mount = (projects = [acme, beta]) =>
  render(
    <ScopeProvider initialProjects={projects}>
      <Probe />
    </ScopeProvider>
  );

beforeEach(() => api.listWebsites.mockResolvedValue([docs]));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe('ScopeProvider', () => {
  it('starts on the first active project, skipping deleted ones', async () => {
    mount([{ ...acme, status: 'deleted' }, beta]);
    await waitFor(() => expect(scope.websites).toHaveLength(1));
    expect(scope.projectId).toBe('p2');
    expect(scope.activeProjects).toEqual([beta]);
    expect(scope.projects).toHaveLength(2);
  });

  it('restores the remembered project, website, and range', async () => {
    window.localStorage.setItem(
      KEY,
      JSON.stringify({ projectId: 'p1', websiteId: 's1', range: { kind: 'preset', preset: '7d' } })
    );
    mount();
    await waitFor(() => expect(scope.websiteId).toBe('s1'));
    expect(scope.projectId).toBe('p1');
    expect(scope.range).toMatchObject({ kind: 'preset', preset: '7d' });
    expect(scope.website?.name).toBe('Docs');
    expect(scope.notice).toBe('');
  });

  it('restores a remembered custom range', async () => {
    const range = {
      kind: 'custom',
      startUtc: '2026-01-01T00:00:00.000Z',
      endUtc: '2026-01-02T00:00:00.000Z'
    };
    window.localStorage.setItem(KEY, JSON.stringify({ projectId: 'p1', websiteId: '', range }));
    mount();
    expect(scope.range).toEqual(range);
  });

  it('falls back to the default range when the remembered range is invalid', () => {
    window.localStorage.setItem(
      KEY,
      JSON.stringify({ range: { kind: 'custom', startUtc: 'nope', endUtc: 'nope' } })
    );
    mount();
    expect(scope.range).toMatchObject({ kind: 'preset', preset: '24h' });
  });

  it('falls back with a visible notice when the remembered project is gone', () => {
    window.localStorage.setItem(KEY, JSON.stringify({ projectId: 'gone', websiteId: '' }));
    mount();
    expect(scope.projectId).toBe('p1');
    expect(scope.notice).toBe('Your previous project is no longer available. Showing Acme.');
  });

  it('falls back with a notice when the remembered website is gone', async () => {
    window.localStorage.setItem(KEY, JSON.stringify({ projectId: 'p1', websiteId: 'missing' }));
    mount();
    await waitFor(() => expect(scope.notice).toMatch(/previous website is no longer available/));
    expect(scope.websiteId).toBe('');
  });

  it('ignores malformed or unavailable storage', () => {
    window.localStorage.setItem(KEY, '{not json');
    mount();
    expect(scope.projectId).toBe('p1');
    expect(scope.range.kind).toBe('preset');
    cleanup();
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    mount();
    expect(scope.projectId).toBe('p1');
  });

  it('clears the website when the project changes and remembers the new scope', async () => {
    mount();
    await waitFor(() => expect(scope.websites).toHaveLength(1));
    act(() => scope.selectWebsite('s1'));
    expect(scope.websiteId).toBe('s1');
    act(() => scope.selectProject('p2'));
    expect(scope.websiteId).toBe('');
    await waitFor(() =>
      expect(JSON.parse(window.localStorage.getItem(KEY)!)).toMatchObject({
        projectId: 'p2',
        websiteId: ''
      })
    );
  });

  it('reconciles when the project list changes', async () => {
    mount();
    await waitFor(() => expect(scope.websites).toHaveLength(1));
    act(() => scope.setProjects([acme, beta], 'p2'));
    expect(scope.projectId).toBe('p2');
    act(() => scope.setProjects([acme, beta], 'p2'));
    expect(scope.projectId).toBe('p2');
    act(() => scope.setProjects([acme]));
    expect(scope.projectId).toBe('p1');
    expect(scope.notice).toBe('The previous project is no longer available. Showing Acme.');
    act(() => scope.setProjects([]));
    expect(scope.projectId).toBe('');
    expect(scope.notice).toBe('The previous project is no longer available.');
    act(() => scope.dismissNotice());
    expect(scope.notice).toBe('');
  });

  it('reports website loading failures and drops a website that disappears on refresh', async () => {
    api.listWebsites.mockRejectedValueOnce(new Error('offline'));
    mount();
    await waitFor(() => expect(scope.websitesError).toBe(true));
    api.listWebsites.mockResolvedValue([docs]);
    await act(() => scope.refreshWebsites());
    expect(scope.websitesError).toBe(false);
    act(() => scope.selectWebsite('s1'));
    api.listWebsites.mockResolvedValue([
      { ...docs, id: 's9' },
      { ...docs, id: 's8', status: 'deleted' }
    ]);
    await act(() => scope.refreshWebsites());
    expect(scope.websiteId).toBe('');
    expect(scope.websites.map((site) => site.id)).toEqual(['s9']);
  });

  it('has no project and refreshes to nothing when there are no projects', async () => {
    mount([]);
    expect(scope.projectId).toBe('');
    await act(async () => expect(await scope.refreshWebsites()).toEqual([]));
  });

  it('throws when used outside the provider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => render(<Probe />)).toThrow(/inside ScopeProvider/);
    spy.mockRestore();
    expect(screen.queryByText('|')).toBeNull();
  });
});
