import type { Project, Website } from '../api/local-operations.js';
export function WebsiteSelector({
  projects,
  websites,
  projectId,
  websiteId,
  onProjectChange,
  onWebsiteChange
}: {
  projects: Project[];
  websites: Website[];
  projectId: string;
  websiteId: string;
  onProjectChange: (id: string) => void;
  onWebsiteChange: (id: string) => void;
}) {
  return (
    <div className="selector-row">
      <label>
        Project
        <select
          aria-label="Project"
          value={projectId}
          onChange={(event) => onProjectChange(event.target.value)}
        >
          <option value="">Select a project</option>
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Website
        <select
          aria-label="Website"
          value={websiteId}
          onChange={(event) => onWebsiteChange(event.target.value)}
          disabled={!projectId}
        >
          <option value="">All websites</option>
          {websites
            .filter((site) => site.status !== 'deleted')
            .map((site) => (
              <option key={site.id} value={site.id}>
                {site.name}
              </option>
            ))}
        </select>
      </label>
    </div>
  );
}
