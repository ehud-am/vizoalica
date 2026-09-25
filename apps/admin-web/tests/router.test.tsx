// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_ROUTE,
  NAV_ROUTES,
  ROUTES,
  hrefFor,
  navKey,
  navigate,
  parseRoute,
  routeArea,
  routeLabel,
  scopeControls,
  showsRange,
  useRoute
} from '../src/router.js';

afterEach(cleanup);

function Current() {
  const route = useRoute();
  return <p data-testid="route">{`${route.path}|${route.websiteId ?? ''}`}</p>;
}

describe('router', () => {
  it('parses fixed addresses and falls back to Overview for anything else', () => {
    expect(parseRoute('#/analytics/geography')).toEqual({ path: 'analytics/geography' });
    expect(parseRoute('#manage/health')).toEqual({ path: 'manage/health' });
    for (const hash of [
      '',
      '#',
      '#/nope',
      '#/analytics',
      '#/manage/installation',
      '#/manage/websites/',
      '#/manage/websites/a/b/c',
      '#/manage/../analytics/pages'
    ])
      expect(parseRoute(hash), hash).toEqual({ path: DEFAULT_ROUTE });
  });

  it('parses website addresses, decodes ids, and never reads "new" as an id', () => {
    expect(parseRoute('#/manage/websites/new')).toEqual({ path: 'manage/websites/new' });
    expect(parseRoute('#/manage/websites/site-1')).toEqual({
      path: 'manage/websites/:id',
      websiteId: 'site-1'
    });
    expect(parseRoute('#/manage/websites/site-1/edit')).toEqual({
      path: 'manage/websites/:id/edit',
      websiteId: 'site-1'
    });
    expect(parseRoute('#/manage/websites/site-1/install')).toEqual({
      path: 'manage/websites/:id/install',
      websiteId: 'site-1'
    });
    expect(parseRoute('#/manage/websites/a%20b')).toEqual({
      path: 'manage/websites/:id',
      websiteId: 'a b'
    });
    expect(parseRoute('#/manage/websites/%E0%A4%A')).toEqual({ path: DEFAULT_ROUTE });
  });

  it('builds hash links, encoding ids, and refuses to build an id route without one', () => {
    expect(hrefFor('manage/websites')).toBe('#/manage/websites');
    expect(hrefFor('manage/websites/:id/edit', 'a b/c')).toBe('#/manage/websites/a%20b%2Fc/edit');
    expect(() => hrefFor('manage/websites/:id')).toThrow(/needs a website id/);
    expect(parseRoute(hrefFor('manage/websites/:id', 'a b/c')).websiteId).toBe('a b/c');
  });

  it('describes each route: area, label, scope controls, range, and navigation section', () => {
    expect(routeArea('analytics/pages')).toBe('analytics');
    expect(routeArea('manage/websites/:id/edit')).toBe('manage');
    expect(routeLabel('manage/websites/:id/install')).toBe('Install');
    expect(scopeControls('analytics/overview')).toBe('project-website');
    expect(scopeControls('manage/websites')).toBe('project');
    expect(scopeControls('manage/websites/:id')).toBe('none');
    expect(scopeControls('manage/projects')).toBe('none');
    expect(showsRange('analytics/geography')).toBe(true);
    expect(showsRange('manage/health')).toBe(false);
    for (const path of [
      'manage/websites/new',
      'manage/websites/:id',
      'manage/websites/:id/edit',
      'manage/websites/:id/install'
    ] as const)
      expect(navKey(path)).toBe('manage/websites');
    expect(navKey('manage/health')).toBe('manage/health');
  });

  it('lists Projects, Websites, Health, Backend, and Access under Manage, and no Installation item', () => {
    expect(
      NAV_ROUTES.filter((route) => route.area === 'manage').map((route) => route.label)
    ).toEqual(['Projects', 'Websites', 'Health', 'Backend', 'Access']);
    expect(ROUTES.some((route) => route.path.endsWith('installation'))).toBe(false);
    expect(new Set(ROUTES.map((route) => route.path)).size).toBe(ROUTES.length);
  });

  it('follows hash changes and navigate(), keeping the same object when nothing changed', async () => {
    render(<Current />);
    expect(screen.getByTestId('route').textContent).toBe(`${DEFAULT_ROUTE}|`);
    act(() => navigate('manage/websites/:id/install', 's1'));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.getByTestId('route').textContent).toBe('manage/websites/:id/install|s1');
    act(() => {
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    expect(screen.getByTestId('route').textContent).toBe('manage/websites/:id/install|s1');
  });
});

describe('router: the Actions page', () => {
  it('is an Analytics navigation item directly after Pages, with project-and-website scope and a range', () => {
    const analytics = NAV_ROUTES.filter((route) => route.area === 'analytics').map((r) => r.path);
    expect(analytics.indexOf('analytics/actions')).toBe(analytics.indexOf('analytics/pages') + 1);
    expect(routeLabel('analytics/actions')).toBe('Actions');
    expect(routeArea('analytics/actions')).toBe('analytics');
    expect(scopeControls('analytics/actions')).toBe('project-website');
    expect(showsRange('analytics/actions')).toBe(true);
    expect(navKey('analytics/actions')).toBe('analytics/actions');
  });

  it('parses the selection from the address', () => {
    expect(parseRoute('#/analytics/actions')).toEqual({ path: 'analytics/actions' });
    expect(parseRoute('#/analytics/actions?page=%2Fpricing&action=Start%20free%20trial')).toEqual({
      path: 'analytics/actions',
      params: { page: '/pricing', action: 'Start free trial' }
    });
    expect(parseRoute('#/analytics/actions?page=%2F%23%2Forders%2F%3Aid')).toEqual({
      path: 'analytics/actions',
      params: { page: '/#/orders/:id' }
    });
  });

  it('ignores unknown, empty, malformed, and oversized parameters instead of breaking', () => {
    expect(parseRoute('#/analytics/actions?other=1&x')).toEqual({ path: 'analytics/actions' });
    expect(parseRoute('#/analytics/actions?page=&action=')).toEqual({ path: 'analytics/actions' });
    expect(parseRoute('#/analytics/actions?page=%E0%A4%A')).toEqual({ path: 'analytics/actions' });
    expect(parseRoute(`#/analytics/actions?action=${'a'.repeat(81)}`)).toEqual({
      path: 'analytics/actions'
    });
    expect(parseRoute(`#/analytics/actions?page=${'a'.repeat(1025)}`)).toEqual({
      path: 'analytics/actions'
    });
    expect(parseRoute('#/analytics/actions?page=%2Fa&page=%2Fb').params).toEqual({ page: '/b' });
  });

  it('keeps a good parameter when another is bad', () => {
    expect(parseRoute('#/analytics/actions?page=%E0%A4%A&action=Go')).toEqual({
      path: 'analytics/actions',
      params: { action: 'Go' }
    });
  });

  it('does not read a query on other routes as a selection, and website routes still parse', () => {
    expect(parseRoute('#/analytics/pages?page=%2Fx')).toEqual({ path: 'analytics/pages' });
    expect(parseRoute('#/manage/websites/site-1?x=1')).toEqual({
      path: 'manage/websites/:id',
      websiteId: 'site-1'
    });
    expect(parseRoute('#/manage/websites/new?page=1')).toEqual({ path: 'manage/websites/new' });
  });

  it('builds addresses with encoded parameters, and round-trips them', () => {
    expect(hrefFor('analytics/actions')).toBe('#/analytics/actions');
    expect(hrefFor('analytics/actions', undefined, {})).toBe('#/analytics/actions');
    const params = { page: '/#/orders/:id?x=1&y=2', action: 'Start free trial & more' };
    const href = hrefFor('analytics/actions', undefined, params);
    expect(href).not.toContain(' ');
    expect(href.split('?')).toHaveLength(2);
    expect(parseRoute(href)).toEqual({ path: 'analytics/actions', params });
    expect(hrefFor('analytics/actions', undefined, { action: 'Go' })).toBe(
      '#/analytics/actions?action=Go'
    );
  });

  it('re-renders when only the selection changes, and not when nothing changed', async () => {
    let renders = 0;
    function Probe() {
      const route = useRoute();
      renders += 1;
      return <p data-testid="probe">{JSON.stringify(route.params ?? {})}</p>;
    }
    window.location.hash = '#/analytics/actions';
    render(<Probe />);
    expect(screen.getByTestId('probe').textContent).toBe('{}');
    // jsdom delivers hashchange asynchronously.
    const settle = () => new Promise((resolve) => setTimeout(resolve, 20));
    await act(async () => {
      navigate('analytics/actions', undefined, { page: '/pricing' });
      await settle();
    });
    expect(screen.getByTestId('probe').textContent).toBe('{"page":"/pricing"}');
    const after = renders;
    await act(async () => {
      window.dispatchEvent(new HashChangeEvent('hashchange'));
      await settle();
    });
    expect(renders).toBe(after);
    await act(async () => {
      navigate('analytics/actions', undefined, { page: '/pricing', action: 'Go' });
      await settle();
    });
    expect(screen.getByTestId('probe').textContent).toBe('{"page":"/pricing","action":"Go"}');
  });
});
