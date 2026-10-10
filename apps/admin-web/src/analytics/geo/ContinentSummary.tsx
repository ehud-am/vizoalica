import { formatNumber, formatShare } from '../../format.js';
import { continentTotals, type LocationData } from './locations.js';

export function ContinentSummary({ data }: { data: LocationData }) {
  const totals = continentTotals(data);
  return (
    <section className="dashboard-card" aria-labelledby="continent-title">
      <h2 id="continent-title">By continent</h2>
      <div className="data-scroll" tabIndex={0} role="region" aria-label="Continents table">
        <table>
          <thead>
            <tr>
              <th scope="col">Continent</th>
              <th scope="col" className="numeric">
                Page views
              </th>
              <th scope="col" className="numeric">
                Share
              </th>
              <th scope="col" className="numeric">
                Countries
              </th>
            </tr>
          </thead>
          <tbody>
            {totals.map((row) => (
              <tr key={row.name}>
                <th scope="row">{row.name}</th>
                <td className="numeric">{formatNumber(row.count)}</td>
                <td className="numeric">{formatShare(row.count, data.total)}</td>
                <td className="numeric">{row.countryCount || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="hint">
        Unlocated is traffic through the Tor network or with no determinable country.
      </p>
    </section>
  );
}
