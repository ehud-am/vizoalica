import { TimeRangeSelector } from '../components/TimeRangeSelector.js';
import { useScope } from '../scope/ScopeProvider.js';

/**
 * The per-page filters: the website (and, for analytics, the time range). The environment and the
 * project are chosen once, in the header; screens read the scope and never render a project picker.
 */
export function ScopeBar({ showWebsite, showRange }: { showWebsite: boolean; showRange: boolean }) {
  const scope = useScope();
  const hasProject = scope.activeProjects.length > 0;
  const websiteFilter = showWebsite && hasProject;
  const rangeFilter = showRange && hasProject;
  if (!websiteFilter && !rangeFilter && !scope.notice && !scope.websitesError) return null;
  return (
    <section className="context-bar" aria-label="Scope">
      {(websiteFilter || rangeFilter) && (
        <div className="context-controls">
          {websiteFilter && (
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
          )}
          {rangeFilter && <TimeRangeSelector applied={scope.range} onApply={scope.setRange} />}
        </div>
      )}
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
