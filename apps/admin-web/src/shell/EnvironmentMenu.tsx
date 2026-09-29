import { useState } from 'react';
import { selectEnvironment, type EnvironmentsList } from '../api/local-operations.js';
import { MenuButton, type MenuItem, type MenuLink } from '../components/MenuButton.js';
import { hrefFor } from '../router.js';
import { isAbsent } from '../setup/availability.js';
import { useSetup } from '../setup/SetupProvider.js';

/** Admin is the default (your own backend), so only a shared role is worth a badge. */
const shownRole = (role: string | undefined | null): boolean => !!role && role !== 'admin';

/**
 * The environment control in the header: choose which usable environment to work on. The name, the
 * role and, for one that cannot be chosen, the reason are separate parts of the item. With one
 * environment it is the same control without a menu.
 */
export function EnvironmentMenu({
  list,
  onChanged
}: {
  list: EnvironmentsList | undefined;
  onChanged: () => void;
}) {
  const { state } = useSetup();
  const [error, setError] = useState('');
  if (!list || !list.selected || list.environments.length === 0) return null;
  const current = list.environments.find((item) => item.name === list.selected);
  const items: MenuItem[] = list.environments.map((environment) => ({
    id: environment.name,
    label: environment.name,
    ...(shownRole(environment.role) ? { badge: environment.role! } : {}),
    ...(environment.usable
      ? {}
      : {
          disabled: true,
          detail: environment.problems[0]?.message ?? 'Needs attention'
        })
  }));
  // Sharing access is an administrator's tool: absent, not disabled, for anyone else.
  const links: MenuLink[] = isAbsent(state, 'manage-access-keys')
    ? []
    : [{ id: 'access-keys', label: 'Share access', href: hrefFor('manage/access') }];
  return (
    <div className="environment-menu">
      <MenuButton
        caption="Backend"
        value={list.selected}
        {...(shownRole(current?.role) ? { badge: current!.role! } : {})}
        items={items}
        selected={list.selected}
        links={links}
        menu={list.environments.length > 1 || links.length > 0}
        {...(current?.url ? { title: current.url } : {})}
        onSelect={(name) => {
          if (name === list.selected) return;
          setError('');
          selectEnvironment(name)
            .then(onChanged)
            .catch(() => setError('That backend could not be selected.'));
        }}
      />
      {error && (
        <span className="notice error" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
