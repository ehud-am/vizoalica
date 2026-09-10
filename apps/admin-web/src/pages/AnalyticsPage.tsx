import { useEffect, useRef, useState } from 'react';
import {
  ApiError,
  getAnalyticsOverview,
  listWebsites,
  type AnalyticsOverview,
  type Project,
  type Website
} from '../api/local-operations.js';
import { DashboardFilters } from '../components/DashboardFilters.js';
import { DistributionChart } from '../components/DistributionChart.js';
import { MetricCard } from '../components/MetricCard.js';
import { RankedTable } from '../components/RankedTable.js';
import { TrafficTrend } from '../components/TrafficTrend.js';
import {
  DEFAULT_RANGE_PRESET,
  presetToRange,
  rangeSummary,
  type AppliedRange
} from '../time-range.js';

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
  const [overview, setOverview] = useState<AnalyticsOverview>();
  const [loading, setLoading] = useState(false);
  const [websitesError, setWebsitesError] = useState('');
  const [analyticsError, setAnalyticsError] = useState('');
  const [range, setRange] = useState<AppliedRange>(() => presetToRange(DEFAULT_RANGE_PRESET));
  const generation = useRef(0);
  const error = websitesError || analyticsError;

  useEffect(() => {
    setWebsiteId('');
    setOverview(undefined);
    setWebsites([]);
    setWebsitesError('');
    if (!projectId) return;
    listWebsites(projectId)
      .then(setWebsites)
      .catch(() => setWebsitesError('Websites could not be loaded.'));
  }, [projectId]);

  useEffect(() => {
    if (!projectId) return;
    const controller = new AbortController();
    const requestGeneration = ++generation.current;
    setLoading(true);
    setAnalyticsError('');
    setOverview(undefined);
    getAnalyticsOverview(
      projectId,
      websiteId || undefined,
      range.startUtc,
      range.endUtc,
      controller.signal
    )
      .then((value) => {
        if (generation.current === requestGeneration) setOverview(value);
      })
      .catch((reason) => {
        if (controller.signal.aborted || generation.current !== requestGeneration) return;
        setAnalyticsError(
          reason instanceof ApiError && reason.status === 401
            ? 'Access expired. Reauthorize the local workspace.'
            : 'Analytics are unavailable. No stale results are shown.'
        );
      })
      .finally(() => {
        if (generation.current === requestGeneration) setLoading(false);
      });
    return () => controller.abort();
  }, [projectId, websiteId, range]);

  return (
    <div className="page dashboard-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Analytics overview</p>
          <h1>Understand what’s happening.</h1>
          <p>Simple, privacy-minded signals from your websites.</p>
        </div>
        <span className="freshness" aria-live="polite">
          {rangeSummary(range)}
        </span>
      </div>

      <section className="panel dashboard-controls" aria-label="Dashboard filters">
        <DashboardFilters
          projects={projects}
          websites={websites}
          projectId={projectId}
          websiteId={websiteId}
          onProjectChange={onProjectChange}
          onWebsiteChange={setWebsiteId}
          range={range}
          onRangeApply={setRange}
        />
      </section>

      <div className="dashboard-status" aria-live="polite" aria-busy={loading}>
        {loading && <p className="metric-empty">Loading current dashboard…</p>}
        {error && (
          <p className="notice error" role="alert">
            {error}
          </p>
        )}
        {overview?.availability.state === 'incomplete' && (
          <p className="notice" role="status">
            This range starts before expanded analytics were available
            {overview.availability.availableFromUtc
              ? ` on ${new Date(overview.availability.availableFromUtc).toLocaleString()}`
              : ''}
            . Available results are shown.
          </p>
        )}
      </div>

      {overview && !loading && !error && (
        <div className="dashboard-grid">
          <MetricCard
            label="Page views"
            value={overview.totals.pageViews}
            description="Accepted page-view events"
          />
          <MetricCard
            label="Unique users"
            value={overview.totals.uniqueUsers}
            description={
              overview.scope.identityMode === 'source-local'
                ? 'First-party identities; websites stay separate'
                : 'Privacy-safe project and first-party identities'
            }
          />
          <TrafficTrend points={overview.trend} />
          <RankedTable title="Top pages" result={overview.rankings.pagePaths} />
          <RankedTable title="Top countries" result={overview.rankings.countries} />
          <RankedTable title="Top user agents" result={overview.rankings.userAgents} />
          <RankedTable title="Top referrers" result={overview.rankings.referrers} />
          <DistributionChart
            title="Operating systems"
            result={overview.distributions.operatingSystems}
          />
          <DistributionChart title="Browsers" result={overview.distributions.browsers} />
          <DistributionChart title="Devices" result={overview.distributions.devices} />
          <DistributionChart
            title="Human, bot, or unknown"
            result={overview.distributions.traffic}
          />
        </div>
      )}

      {!projectId && <p className="metric-empty">Choose a project to view analytics.</p>}

      <section className="principles">
        <article>
          <span aria-hidden="true">◌</span>
          <div>
            <strong>Bounded aggregates</strong>
            <p>Every view uses indexed summaries—never a raw-event scan.</p>
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
