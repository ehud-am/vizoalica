import { useEffect, useState } from 'react';
import {
  getReachability,
  getStatus,
  type Reachability,
  type Status,
  type Website
} from '../api/local-operations.js';
import { NoProject } from '../components/NoProject.js';
import { OperationalStatus } from '../components/OperationalStatus.js';
import { WebsiteReachability } from '../components/WebsiteReachability.js';
import { hrefFor } from '../router.js';
import { useScope } from '../scope/ScopeProvider.js';

interface Health {
  status?: Status;
  reachability?: Reachability;
  failed: boolean;
}

/** The single most useful next step for a website's current health. */
export function nextStep(site: Website, health: Health): string {
  if (health.failed) return 'Health details are unavailable. Check the local API, then try again.';
  if (site.status === 'disabled') return 'Enable the website to resume collection.';
  const { status, reachability } = health;
  if (status?.dataAccess === 'unavailable')
    return 'Run pnpm vizoalica status to check data access.';
  if (status?.configuration === 'attention') return 'Review the installation configuration.';
  if (reachability && !reachability.configEndpointReachable)
    return "Check that the website's configuration endpoint is deployed and reachable.";
  if (status?.aggregation === 'processing')
    return 'Aggregates are catching up. Check again shortly.';
  if (status?.aggregation === 'unavailable')
    return 'Aggregation is unavailable. Check again shortly.';
  return 'No action needed.';
}

export function HealthPage() {
  const { projectId, project, website, websites } = useScope();
  const sites = website ? [website] : websites;
  const [health, setHealth] = useState<Record<string, Health>>({});
  const key = sites.map((site) => `${site.id}:${site.status}`).join(',');

  useEffect(() => {
    setHealth({});
    if (!projectId) return;
    let cancelled = false;
    for (const site of sites) {
      Promise.all([
        getStatus(projectId, site.id),
        getReachability(projectId, site.id).catch(() => undefined)
      ])
        .then(([status, reachability]) => {
          if (!cancelled)
            setHealth((prior) => ({
              ...prior,
              [site.id]: { status, ...(reachability ? { reachability } : {}), failed: false }
            }));
        })
        .catch(() => {
          if (!cancelled) setHealth((prior) => ({ ...prior, [site.id]: { failed: true } }));
        });
    }
    return () => {
      cancelled = true;
    };
    // The site list is captured through `key`, which changes exactly when it does.
  }, [projectId, key]);

  return (
    <div className="page health-page" data-page="health">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Manage{project ? ` · ${project.name}` : ''}</p>
          <h1>Health</h1>
          <p>Collection, aggregation, configuration, and reachability for each website.</p>
        </div>
      </div>
      {!projectId ? (
        <NoProject />
      ) : sites.length === 0 ? (
        <div className="empty-list">
          <strong>No websites yet</strong>
          <span>
            <a href={hrefFor('manage/websites')}>Add a website</a> to see its health.
          </span>
        </div>
      ) : (
        <ul className="health-list">
          {sites.map((site) => {
            const value = health[site.id];
            return (
              <li key={site.id}>
                <section className="panel" aria-labelledby={`health-${site.id}`}>
                  <div className="card-heading">
                    <h2 id={`health-${site.id}`}>{site.name}</h2>
                    <span className={`status ${site.status}`}>{site.status}</span>
                  </div>
                  {!value ? (
                    <p className="metric-empty" aria-busy="true">
                      Checking…
                    </p>
                  ) : (
                    <>
                      <p className="next-step">
                        <strong>Next step:</strong> {nextStep(site, value)}
                      </p>
                      {value.status && <OperationalStatus status={value.status} />}
                      {value.reachability && (
                        <WebsiteReachability reachability={value.reachability} />
                      )}
                    </>
                  )}
                </section>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
