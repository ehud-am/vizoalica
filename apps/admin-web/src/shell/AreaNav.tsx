import { NAV_ROUTES, hrefFor, navKey, type Route, type RouteArea } from '../router.js';

const GROUPS: Array<{ area: RouteArea; label: string }> = [
  { area: 'analytics', label: 'Analytics' },
  { area: 'manage', label: 'Manage' }
];

/**
 * Primary navigation: reports (view) and configuration (manage) are separate, labelled groups.
 * Pages inside a section (a website's page, its edit form) keep the section marked as current.
 */
export function AreaNav({ route }: { route: Route }) {
  const section = navKey(route.path);
  return (
    <nav aria-label="Primary navigation" className="area-nav">
      {GROUPS.map((group) => (
        <div key={group.area} className="nav-group" data-area={group.area}>
          <p className="eyebrow" id={`nav-${group.area}`}>
            {group.label}
          </p>
          <ul aria-labelledby={`nav-${group.area}`}>
            {NAV_ROUTES.filter((item) => item.area === group.area).map((item) => (
              <li key={item.path}>
                <a
                  className={item.path === section ? 'nav-item active' : 'nav-item'}
                  href={hrefFor(item.path)}
                  // "page" only for the page itself; "true" marks the section around a deeper page.
                  aria-current={
                    item.path === route.path ? 'page' : item.path === section ? 'true' : undefined
                  }
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}
