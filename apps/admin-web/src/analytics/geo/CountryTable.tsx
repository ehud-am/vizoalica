import { useState } from 'react';
import { formatNumber, formatShare } from '../../format.js';
import type { LocationData } from './locations.js';

type SortKey = 'name' | 'count';

/** Every location with traffic, sortable. This table is the accessible equivalent of the map. */
export function CountryTable({ data }: { data: LocationData }) {
  const [sort, setSort] = useState<{ key: SortKey; direction: 'ascending' | 'descending' }>({
    key: 'count',
    direction: 'descending'
  });
  const factor = sort.direction === 'ascending' ? 1 : -1;
  const rows = [...data.rows].sort((a, b) =>
    sort.key === 'name'
      ? factor * a.name.localeCompare(b.name)
      : factor * (a.count - b.count) || a.name.localeCompare(b.name)
  );
  const toggle = (key: SortKey) =>
    setSort((current) =>
      current.key === key
        ? { key, direction: current.direction === 'ascending' ? 'descending' : 'ascending' }
        : { key, direction: key === 'name' ? 'ascending' : 'descending' }
    );
  const header = (key: SortKey, label: string, numeric: boolean) => (
    <th
      scope="col"
      className={numeric ? 'numeric' : undefined}
      aria-sort={sort.key === key ? sort.direction : 'none'}
    >
      <button className="sort-button" type="button" onClick={() => toggle(key)}>
        {label}
        <span aria-hidden="true">
          {sort.key === key ? (sort.direction === 'ascending' ? ' ▲' : ' ▼') : ''}
        </span>
      </button>
    </th>
  );
  return (
    <section className="dashboard-card" aria-labelledby="country-table-title">
      <h2 id="country-table-title">All locations</h2>
      <div className="data-scroll" tabIndex={0} role="region" aria-label="Locations table">
        <table>
          <thead>
            <tr>
              {header('name', 'Location', false)}
              {header('count', 'Page views', true)}
              <th scope="col" className="numeric">
                Share
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key}>
                <th scope="row">
                  {row.name}
                  {row.code && <span className="secondary-text"> {row.code}</span>}
                </th>
                <td className="numeric">{formatNumber(row.count)}</td>
                <td className="numeric">{formatShare(row.count, data.total)}</td>
              </tr>
            ))}
            {data.otherCount > 0 && (
              <tr>
                <th scope="row">Other (not itemized)</th>
                <td className="numeric">{formatNumber(data.otherCount)}</td>
                <td className="numeric">{formatShare(data.otherCount, data.total)}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
