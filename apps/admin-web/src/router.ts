import { useEffect, useState } from 'react';

export const ROUTES = [
  { path: 'analytics/overview', area: 'analytics', label: 'Overview' },
  { path: 'analytics/pages', area: 'analytics', label: 'Pages' },
  { path: 'analytics/sources', area: 'analytics', label: 'Sources' },
  { path: 'analytics/geography', area: 'analytics', label: 'Geography' },
  { path: 'analytics/technology', area: 'analytics', label: 'Technology' },
  { path: 'analytics/traffic-quality', area: 'analytics', label: 'Traffic quality' },
  { path: 'manage/projects', area: 'manage', label: 'Projects' },
  { path: 'manage/websites', area: 'manage', label: 'Websites' },
  { path: 'manage/installation', area: 'manage', label: 'Installation' },
  { path: 'manage/health', area: 'manage', label: 'Health' }
] as const;

export type RoutePath = (typeof ROUTES)[number]['path'];
export type RouteArea = (typeof ROUTES)[number]['area'];
export const DEFAULT_ROUTE: RoutePath = 'analytics/overview';

export function parseRoute(hash: string): RoutePath {
  const path = hash.replace(/^#\/?/, '');
  return ROUTES.find((route) => route.path === path)?.path ?? DEFAULT_ROUTE;
}

export const routeArea = (path: RoutePath): RouteArea =>
  ROUTES.find((route) => route.path === path)!.area;

export const hrefFor = (path: RoutePath): string => `#/${path}`;

export function navigate(path: RoutePath): void {
  window.location.hash = hrefFor(path);
}

export function useRoute(): RoutePath {
  const [route, setRoute] = useState<RoutePath>(() => parseRoute(window.location.hash));
  useEffect(() => {
    const onChange = () => setRoute(parseRoute(window.location.hash));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}
