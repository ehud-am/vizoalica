import { MenuButton, type MenuItem } from '../components/MenuButton.js';
import { hrefFor, navigate, type Route } from '../router.js';
import { useScope } from '../scope/ScopeProvider.js';

/**
 * The project control in the header. It only switches: it lists the projects, marks the current
 * one, and ends with the way to the Projects page, which is where projects are created and
 * deleted. Every page but Projects works inside the project chosen here.
 */
export function ProjectMenu({ route }: { route: Route }) {
  const scope = useScope();
  const items: MenuItem[] = scope.activeProjects.map((project) => ({
    id: project.id,
    label: project.name,
    detail:
      project.websiteCount === undefined
        ? project.id
        : `${project.websiteCount} ${project.websiteCount === 1 ? 'website' : 'websites'} · ${project.id}`
  }));
  const empty = items.length === 0;
  return (
    <MenuButton
      caption="Project"
      value={scope.project?.name ?? 'No project yet'}
      items={items}
      selected={scope.projectId}
      links={[
        empty
          ? {
              id: 'create',
              label: 'Create your first project',
              href: hrefFor('manage/projects')
            }
          : { id: 'all', label: 'All projects…', href: hrefFor('manage/projects') }
      ]}
      {...(scope.project ? { title: scope.project.id } : {})}
      onSelect={(id) => {
        if (id === scope.projectId) return;
        scope.selectProject(id);
        // A website page belongs to one project, so leave it rather than show it under another.
        if (route.websiteId) navigate('manage/websites');
      }}
    />
  );
}
