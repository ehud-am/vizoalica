import type { EnvironmentsList } from '../api/local-operations.js';
import { showsScopeHeader, type Route } from '../router.js';
import { EnvironmentMenu } from './EnvironmentMenu.js';
import { ProjectMenu } from './ProjectMenu.js';

/**
 * What the console is working on, at the top of every page: the environment, then the project.
 * The Projects page lists every project in the environment, so it does not show the project.
 */
export function ScopeSwitcher({
  list,
  route,
  onEnvironmentChanged
}: {
  list: EnvironmentsList | undefined;
  route: Route;
  onEnvironmentChanged: () => void;
}) {
  return (
    <div className="scope-switcher" role="group" aria-label="Environment and project">
      <EnvironmentMenu list={list} onChanged={onEnvironmentChanged} />
      {showsScopeHeader(route.path) && <ProjectMenu route={route} />}
    </div>
  );
}
