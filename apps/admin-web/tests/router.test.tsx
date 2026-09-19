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

  it('lists Projects, Websites, and Health under Manage, and no Installation item', () => {
    expect(
      NAV_ROUTES.filter((route) => route.area === 'manage').map((route) => route.label)
    ).toEqual(['Projects', 'Websites', 'Health']);
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
