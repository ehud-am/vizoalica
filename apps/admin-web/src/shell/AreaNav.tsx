import { ROUTES, hrefFor, type RouteArea, type RoutePath } from '../router.js';

const GROUPS: Array<{ area: RouteArea; label: string }> = [
  { area: 'analytics', label: 'Analytics' },
  { area: 'manage', label: 'Manage' }
];

/** Primary navigation: reports (view) and configuration (manage) are separate, labelled groups. */
export function AreaNav({ route }: { route: RoutePath }) {
  return (
    <nav aria-label="Primary navigation" className="area-nav">
      {GROUPS.map((group) => (
        <div key={group.area} className="nav-group" data-area={group.area}>
          <p className="eyebrow" id={`nav-${group.area}`}>
            {group.label}
          </p>
          <ul aria-labelledby={`nav-${group.area}`}>
            {ROUTES.filter((item) => item.area === group.area).map((item) => (
              <li key={item.path}>
                <a
                  className={item.path === route ? 'nav-item active' : 'nav-item'}
                  href={hrefFor(item.path)}
                  aria-current={item.path === route ? 'page' : undefined}
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
