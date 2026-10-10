import { DistributionBars } from '../components/DistributionBars.js';
import { RankedList } from '../components/RankedList.js';
import { AnalyticsView } from './AnalyticsView.js';

export function PagesPage() {
  return (
    <AnalyticsView page="pages" title="Pages" description="Which pages people view most.">
      {(overview) => (
        <div className="dashboard-grid single">
          <RankedList
            title="Top pages"
            result={overview.rankings.pagePaths}
            countLabel="Page views"
          />
        </div>
      )}
    </AnalyticsView>
  );
}

export function SourcesPage() {
  return (
    <AnalyticsView page="sources" title="Sources" description="Where your visitors arrive from.">
      {(overview) => (
        <div className="dashboard-grid single">
          <RankedList
            title="Top sources"
            result={overview.rankings.referrers}
            countLabel="Page views"
          />
        </div>
      )}
    </AnalyticsView>
  );
}

export function TechnologyPage() {
  return (
    <AnalyticsView
      page="technology"
      title="Technology"
      description="The browsers, operating systems, and devices your visitors use."
    >
      {(overview) => (
        <div className="dashboard-grid">
          <DistributionBars title="Browsers" result={overview.distributions.browsers} />
          <DistributionBars
            title="Operating systems"
            result={overview.distributions.operatingSystems}
          />
          <DistributionBars title="Devices" result={overview.distributions.devices} />
          <RankedList
            title="Browser versions"
            result={overview.rankings.userAgents}
            countLabel="Page views"
          />
        </div>
      )}
    </AnalyticsView>
  );
}

export function TrafficQualityPage() {
  return (
    <AnalyticsView
      page="traffic-quality"
      title="Traffic quality"
      description="How much of your traffic looks human, automated, or unknown."
    >
      {(overview) => (
        <div className="dashboard-grid single">
          <DistributionBars
            title="Human, bot, or unknown"
            result={overview.distributions.traffic}
          />
        </div>
      )}
    </AnalyticsView>
  );
}
