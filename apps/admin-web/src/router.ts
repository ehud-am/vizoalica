import { useEffect, useState } from 'react';

export type ScopeControls = 'none' | 'project' | 'project-website';

interface RouteDef {
  /** Address after `#/`. `:id` stands for a website id. */
  path: string;
  area: 'analytics' | 'manage';
  label: string;
  /** Shown as its own item in the primary navigation. */
  nav: boolean;
  /** The navigation item that is current while on this page. */
  parent?: string;
  /** Which shell scope controls make sense here. */
  scope: ScopeControls;
  /** Whether the time range control is shown. */
  range: boolean;
}

const define = <const T extends readonly RouteDef[]>(routes: T) => routes;

export const ROUTES = define([
  {
    path: 'analytics/overview',
    area: 'analytics',
    label: 'Overview',
    nav: true,
    scope: 'project-website',
    range: true
  },
  {
    path: 'analytics/pages',
    area: 'analytics',
    label: 'Pages',
    nav: true,
    scope: 'project-website',
    range: true
  },
  {
    path: 'analytics/actions',
    area: 'analytics',
    label: 'Actions',
    nav: true,
    scope: 'project-website',
    range: true
  },
  {
    path: 'analytics/sources',
    area: 'analytics',
    label: 'Sources',
    nav: true,
    scope: 'project-website',
    range: true
  },
  {
    path: 'analytics/geography',
    area: 'analytics',
    label: 'Geography',
    nav: true,
    scope: 'project-website',
    range: true
  },
  {
    path: 'analytics/technology',
    area: 'analytics',
    label: 'Technology',
    nav: true,
    scope: 'project-website',
    range: true
  },
  {
    path: 'analytics/traffic-quality',
    area: 'analytics',
    label: 'Traffic quality',
    nav: true,
    scope: 'project-website',
    range: true
  },
  {
    path: 'manage/projects',
    area: 'manage',
    label: 'Projects',
    nav: true,
    scope: 'none',
    range: false
  },
  {
    path: 'manage/websites',
    area: 'manage',
    label: 'Websites',
    nav: true,
    scope: 'project',
    range: false
  },
  {
    path: 'manage/websites/new',
    area: 'manage',
    label: 'Add website',
    nav: false,
    parent: 'manage/websites',
    scope: 'none',
    range: false
  },
  {
    path: 'manage/websites/:id',
    area: 'manage',
    label: 'Website',
    nav: false,
    parent: 'manage/websites',
    scope: 'none',
    range: false
  },
  {
    path: 'manage/websites/:id/edit',
    area: 'manage',
    label: 'Edit website',
    nav: false,
    parent: 'manage/websites',
    scope: 'none',
    range: false
  },
  {
    path: 'manage/websites/:id/install',
    area: 'manage',
    label: 'Install',
    nav: false,
    parent: 'manage/websites',
    scope: 'none',
    range: false
  },
  {
    path: 'manage/health',
    area: 'manage',
    label: 'Health',
    nav: true,
    scope: 'project-website',
    range: false
  }
]);

export type RoutePath = (typeof ROUTES)[number]['path'];
export type RouteArea = RouteDef['area'];
export const DEFAULT_ROUTE: RoutePath = 'analytics/overview';

/** A page plus, for website pages, which website it is about. */
export interface Route {
  path: RoutePath;
  websiteId?: string;
  /** Selections carried in the address, only on the Actions page. */
  params?: RouteParams;
}

/** The Actions report can be narrowed to a page or to an action; both live in the address. */
export interface RouteParams {
  page?: string;
  action?: string;
}
// The Worker refuses longer values, so an address carrying one is treated as carrying none.
const PARAM_LIMITS = { page: 1024, action: 80 } as const;

/** Routes that appear in the primary navigation, in order. */
export const NAV_ROUTES = ROUTES.filter((route) => route.nav);

const definition = (path: RoutePath): RouteDef => ROUTES.find((route) => route.path === path)!;

function parseParams(query: string): RouteParams | undefined {
  const params: RouteParams = {};
  for (const pair of query.split('&')) {
    const at = pair.indexOf('=');
    const name = at < 0 ? pair : pair.slice(0, at);
    if (name !== 'page' && name !== 'action') continue;
    try {
      const value = decodeURIComponent(pair.slice(at + 1));
      if (value && value.length <= PARAM_LIMITS[name]) params[name] = value;
    } catch {
      // A malformed encoding means no selection, never a broken page.
    }
  }
  return params.page || params.action ? params : undefined;
}

export function parseRoute(hash: string): Route {
  const raw = hash.replace(/^#\/?/, '');
  const queryAt = raw.indexOf('?');
  const address = queryAt < 0 ? raw : raw.slice(0, queryAt);
  // Fixed addresses win over ones with an id, so "new" can never be read as a website id.
  const fixed = ROUTES.find((route) => route.path === address);
  if (fixed) {
    const params =
      fixed.path === 'analytics/actions' && queryAt >= 0
        ? parseParams(raw.slice(queryAt + 1))
        : undefined;
    return { path: fixed.path, ...(params ? { params } : {}) };
  }
  const parts = address.split('/');
  for (const route of ROUTES) {
    const pattern = route.path.split('/');
    if (!route.path.includes(':id') || pattern.length !== parts.length) continue;
    if (!pattern.every((segment, index) => segment === ':id' || segment === parts[index])) continue;
    const raw = parts[pattern.indexOf(':id')]!;
    let websiteId = '';
    try {
      websiteId = decodeURIComponent(raw);
    } catch {
      return { path: DEFAULT_ROUTE };
    }
    if (websiteId) return { path: route.path, websiteId };
  }
  return { path: DEFAULT_ROUTE };
}

export const routeArea = (path: RoutePath): RouteArea => definition(path).area;
export const routeLabel = (path: RoutePath): string => definition(path).label;
/** The navigation item to mark current while on this page. */
export const navKey = (path: RoutePath): RoutePath =>
  (definition(path).parent as RoutePath | undefined) ?? path;
export const scopeControls = (path: RoutePath): ScopeControls => definition(path).scope;
export const showsRange = (path: RoutePath): boolean => definition(path).range;

export function hrefFor(path: RoutePath, websiteId?: string, params?: RouteParams): string {
  if (path.includes(':id') && !websiteId) throw new Error(`${path} needs a website id`);
  const base = `#/${websiteId ? path.replace(':id', encodeURIComponent(websiteId)) : path}`;
  const query = [
    params?.page ? `page=${encodeURIComponent(params.page)}` : '',
    params?.action ? `action=${encodeURIComponent(params.action)}` : ''
  ].filter(Boolean);
  return query.length ? `${base}?${query.join('&')}` : base;
}

export function navigate(path: RoutePath, websiteId?: string, params?: RouteParams): void {
  window.location.hash = hrefFor(path, websiteId, params);
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.hash));
  useEffect(() => {
    const onChange = () => {
      const next = parseRoute(window.location.hash);
      setRoute((current) =>
        current.path === next.path &&
        current.websiteId === next.websiteId &&
        current.params?.page === next.params?.page &&
        current.params?.action === next.params?.action
          ? current
          : next
      );
    };
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}
