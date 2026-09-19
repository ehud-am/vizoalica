// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_ROUTE,
  hrefFor,
  navigate,
  parseRoute,
  routeArea,
  useRoute
} from '../src/router.js';

afterEach(cleanup);

function Current() {
  return <p data-testid="route">{useRoute()}</p>;
}

describe('router', () => {
  it('parses known hashes and falls back to Overview for anything else', () => {
    expect(parseRoute('#/analytics/geography')).toBe('analytics/geography');
    expect(parseRoute('#manage/health')).toBe('manage/health');
    for (const hash of ['', '#', '#/nope', '#/analytics', '#/manage/../analytics/pages'])
      expect(parseRoute(hash)).toBe(DEFAULT_ROUTE);
  });

  it('maps routes to areas and builds hash links', () => {
    expect(routeArea('analytics/pages')).toBe('analytics');
    expect(routeArea('manage/projects')).toBe('manage');
    expect(hrefFor('manage/websites')).toBe('#/manage/websites');
  });

  it('follows hash changes and navigate()', () => {
    render(<Current />);
    expect(screen.getByTestId('route').textContent).toBe(DEFAULT_ROUTE);
    act(() => navigate('manage/installation'));
    return new Promise<void>((resolve) =>
      setTimeout(() => {
        expect(screen.getByTestId('route').textContent).toBe('manage/installation');
        resolve();
      }, 20)
    );
  });
});
