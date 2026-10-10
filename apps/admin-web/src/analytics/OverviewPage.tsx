import { MetricCard } from '../components/MetricCard.js';
import { RankedList } from '../components/RankedList.js';
import { TrafficTrend } from '../components/TrafficTrend.js';
import { describeLocation } from '../geo/geo-labels.js';
import { hrefFor } from '../router.js';
import { useScope } from '../scope/ScopeProvider.js';
import { useAnalytics } from './AnalyticsProvider.js';
import { AnalyticsView } from './AnalyticsView.js';
import { compareMetric } from './comparison.js';

const periodLabel = (kind: 'preset' | 'custom', label: string) =>
  kind === 'preset' ? `previous ${label.replace(/^Last /, '')}` : 'previous period';

export function OverviewPage() {
  const { range } = useScope();
  const { previous } = useAnalytics();
  const label =
    range.kind === 'preset'
      ? periodLabel('preset', presetText(range.preset))
      : periodLabel('custom', '');
  return (
    <AnalyticsView
      page="overview"
      title="Overview"
      description="Traffic at a glance, compared with the previous period."
    >
      {(overview) => {
        const compare = (current: number, key: 'pageViews' | 'uniqueUsers') =>
          previous.state === 'loading'
            ? ('loading' as const)
            : compareMetric(current, previous.totals?.[key], previous.state);
        return (
          <>
            <div className="metrics">
              <MetricCard
                label="Page views"
                value={overview.totals.pageViews}
                description="Accepted page-view events"
                comparison={compare(overview.totals.pageViews, 'pageViews')}
                periodLabel={label}
                trend={overview.trend.map((point) => point.pageViews)}
              />
              <MetricCard
                label="Unique users"
                value={overview.totals.uniqueUsers}
                description={
                  overview.scope.identityMode === 'source-local'
                    ? 'First-party identities; websites stay separate'
                    : 'Privacy-safe project and first-party identities'
                }
                comparison={compare(overview.totals.uniqueUsers, 'uniqueUsers')}
                periodLabel={label}
                trend={overview.trend.map((point) => point.uniqueUsers)}
              />
            </div>
            <div className="dashboard-grid">
              <TrafficTrend points={overview.trend} />
              <RankedList
                title="Top pages"
                result={overview.rankings.pagePaths}
                countLabel="Page views"
                initialLimit={5}
                moreLink={{ href: hrefFor('analytics/pages'), label: 'All pages' }}
              />
              <RankedList
                title="Top sources"
                result={overview.rankings.referrers}
                countLabel="Page views"
                initialLimit={5}
                moreLink={{ href: hrefFor('analytics/sources'), label: 'All sources' }}
              />
              <RankedList
                title="Top countries"
                result={overview.rankings.countries}
                countLabel="Page views"
                initialLimit={5}
                describe={(value) => ({ name: describeLocation(value).name })}
                moreLink={{ href: hrefFor('analytics/geography'), label: 'Map and all countries' }}
              />
            </div>
          </>
        );
      }}
    </AnalyticsView>
  );
}

function presetText(preset: string): string {
  return (
    { '6h': '6 hours', '12h': '12 hours', '24h': '24 hours', '7d': '7 days', '30d': '30 days' }[
      preset
    ] ?? 'period'
  );
}
