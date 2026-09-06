import { useEffect, useState } from 'react';
import {
  ApiError,
  getAnalytics,
  listWebsites,
  type Project,
  type Summary,
  type Website,
  type Window
} from '../api/local-operations.js';
import { AnalyticsSummary } from '../components/AnalyticsSummary.js';
import { WebsiteSelector } from '../components/WebsiteSelector.js';
export function AnalyticsPage({
  projects,
  projectId,
  onProjectChange
}: {
  projects: Project[];
  projectId: string;
  onProjectChange: (id: string) => void;
}) {
  const [websites, setWebsites] = useState<Website[]>([]);
  const [websiteId, setWebsiteId] = useState('');
  const [window, setWindow] = useState<Window>('24h');
  const [summary, setSummary] = useState<Summary>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    setWebsiteId('');
    setSummary(undefined);
    if (!projectId) return;
    listWebsites(projectId)
      .then((items) => {
        setWebsites(items);
        setWebsiteId(items.find((item) => item.status !== 'deleted')?.id ?? '');
      })
      .catch(() => setError('Websites could not be loaded.'));
  }, [projectId]);
  useEffect(() => {
    if (!projectId || !websiteId) return;
    setLoading(true);
    setError('');
    getAnalytics(projectId, websiteId, window)
      .then(setSummary)
      .catch((reason) => {
        setSummary(undefined);
        setError(
          reason instanceof ApiError && reason.status === 401
            ? 'Access expired. Reauthorize the local workspace.'
            : 'Analytics are unavailable. No stale totals are shown.'
        );
      })
      .finally(() => setLoading(false));
  }, [projectId, websiteId, window]);
  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Analytics overview</p>
          <h1>Understand what’s happening.</h1>
          <p>Simple, privacy-minded signals from your websites.</p>
        </div>
        <span className="freshness">Updated on request</span>
      </div>
      <section className="panel">
        <WebsiteSelector
          projects={projects}
          websites={websites}
          projectId={projectId}
          websiteId={websiteId}
          onProjectChange={onProjectChange}
          onWebsiteChange={setWebsiteId}
        />
        <AnalyticsSummary
          summary={summary}
          window={window}
          loading={loading}
          onWindowChange={setWindow}
        />
        {error && (
          <p className="notice error" role="alert">
            {error}
          </p>
        )}
      </section>
      <section className="principles">
        <article>
          <span aria-hidden="true">◌</span>
          <div>
            <strong>Bounded aggregates</strong>
            <p>Every view uses fixed hourly summaries—never a raw-event scan.</p>
          </div>
        </article>
        <article>
          <span aria-hidden="true">◇</span>
          <div>
            <strong>Private unique counts</strong>
            <p>Visitor digests stay inside the data plane and never reach this browser.</p>
          </div>
        </article>
      </section>
    </div>
  );
}
