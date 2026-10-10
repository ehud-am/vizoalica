import { AnalyticsView } from './AnalyticsView.js';
import { ContinentSummary } from './geo/ContinentSummary.js';
import { CountryTable } from './geo/CountryTable.js';
import { WorldMap } from './geo/WorldMap.js';
import { toLocationData } from './geo/locations.js';

export function GeographyPage() {
  return (
    <AnalyticsView
      page="geography"
      title="Geography"
      description="Where your visitors are, by country and continent."
    >
      {(overview) => {
        const data = toLocationData(overview.rankings.countries);
        if (data.total === 0) return <p className="chart-empty">No location data in this range.</p>;
        return (
          <div className="geo-layout">
            <WorldMap data={data} />
            <ContinentSummary data={data} />
            <CountryTable data={data} />
          </div>
        );
      }}
    </AnalyticsView>
  );
}
