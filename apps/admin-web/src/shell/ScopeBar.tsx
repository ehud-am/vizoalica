import { TimeRangeSelector } from '../components/TimeRangeSelector.js';
import { useScope } from '../scope/ScopeProvider.js';

/**
 * The single place to choose the project and website (and, for analytics, the time range).
 * Screens read the scope; they never render their own project picker.
 */
export function ScopeBar({ showProject, showRange }: { showProject: boolean; showRange: boolean }) {
  const scope = useScope();
  if (!showProject && !showRange && !scope.notice) return null;
  return (
    <section className="context-bar" aria-label="Scope">
      <div className="context-controls">
        {showProject &&
          (scope.activeProjects.length === 0 ? (
            <p className="context-empty">No project yet</p>
          ) : (
            <>
              <label>
                Project
                <select
                  aria-label="Project"
                  value={scope.projectId}
                  onChange={(event) => scope.selectProject(event.target.value)}
                >
                  {scope.activeProjects.map((project) => (
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
                  value={scope.websiteId}
                  onChange={(event) => scope.selectWebsite(event.target.value)}
                >
                  <option value="">All websites</option>
                  {scope.websites.map((site) => (
                    <option key={site.id} value={site.id}>
                      {site.status === 'disabled'
                        ? `${site.name} (history only, disabled)`
                        : site.name}
                    </option>
                  ))}
                </select>
              </label>
            </>
          ))}
        {showRange && showProject && scope.activeProjects.length > 0 && (
          <TimeRangeSelector applied={scope.range} onApply={scope.setRange} />
        )}
      </div>
      {scope.websitesError && (
        <p className="notice error" role="alert">
          Websites could not be loaded.
        </p>
      )}
      {scope.notice && (
        <p className="notice" role="status">
          {scope.notice}{' '}
          <button className="link-button" type="button" onClick={scope.dismissNotice}>
            Dismiss
          </button>
        </p>
      )}
    </section>
  );
}
