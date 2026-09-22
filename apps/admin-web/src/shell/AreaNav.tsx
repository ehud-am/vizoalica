import type { CapabilityId } from '../capabilities.js';
import { isAbsent } from '../setup/availability.js';
import { useSetup } from '../setup/SetupProvider.js';
import { NAV_ROUTES, hrefFor, navKey, type Route, type RouteArea, type RoutePath } from '../router.js';

const GROUPS: Array<{ area: RouteArea; label: string }> = [
  { area: 'analytics', label: 'Analytics' },
  { area: 'manage', label: 'Manage' }
];

/** Routes a role may never use are removed from navigation entirely, not merely disabled. */
const ROUTE_CAPABILITY: Partial<Record<RoutePath, CapabilityId>> = {
  'manage/access': 'manage-access-keys'
};

/**
 * Primary navigation: reports (view) and configuration (manage) are separate, labelled groups.
 * Pages inside a section (a website's page, its edit form) keep the section marked as current.
 */
export function AreaNav({ route }: { route: Route }) {
  const { state } = useSetup();
  const section = navKey(route.path);
  const visible = NAV_ROUTES.filter((item) => {
    const capability = ROUTE_CAPABILITY[item.path];
    return !capability || !isAbsent(state, capability);
  });
  return (
    <nav aria-label="Primary navigation" className="area-nav">
      {GROUPS.map((group) => (
        <div key={group.area} className="nav-group" data-area={group.area}>
          <p className="eyebrow" id={`nav-${group.area}`}>
            {group.label}
          </p>
          <ul aria-labelledby={`nav-${group.area}`}>
            {visible.filter((item) => item.area === group.area).map((item) => (
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
