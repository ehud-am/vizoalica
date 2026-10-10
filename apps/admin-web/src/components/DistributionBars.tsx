import { useId, useState } from 'react';
import type { DistributionResult } from '../api/local-operations.js';
import { formatNumber, formatShare } from '../format.js';

/**
 * A distribution as sorted horizontal bars, with the exact values a click away. Every value is
 * printed next to its bar, so nothing depends on color, and one hue is enough because the
 * labels carry identity.
 */
export function DistributionBars({
  title,
  result,
  countLabel = 'Page views'
}: {
  title: string;
  result: DistributionResult;
  countLabel?: string;
}) {
  const headingId = useId();
  const [table, setTable] = useState(false);
  const max = Math.max(...result.items.map((item) => item.count), 1);
  return (
    <section className="dashboard-card distribution-card" aria-labelledby={headingId}>
      <div className="card-heading">
        <h2 id={headingId}>{title}</h2>
        {result.total > 0 && (
          <button
            className="link-button"
            type="button"
            aria-pressed={table}
            onClick={() => setTable((value) => !value)}
          >
            {table ? 'Show bars' : 'View as table'}
          </button>
        )}
      </div>
      {result.total === 0 ? (
        <p className="chart-empty">No data in this range.</p>
      ) : table ? (
        <div className="data-scroll" tabIndex={0} role="region" aria-label={`${title} table`}>
          <table>
            <thead>
              <tr>
                <th scope="col">Value</th>
                <th scope="col" className="numeric">
                  {countLabel}
                </th>
                <th scope="col" className="numeric">
                  Share
                </th>
              </tr>
            </thead>
            <tbody>
              {result.items.map((item) => (
                <tr key={item.label}>
                  <th scope="row">{item.label}</th>
                  <td className="numeric">{formatNumber(item.count)}</td>
                  <td className="numeric">{formatShare(item.count, result.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <ul className="bar-list">
          {result.items.map((item) => (
            <li key={item.label} className={item.label === 'Other' ? 'bar-row other' : 'bar-row'}>
              <span className="bar-label">{item.label}</span>
              <span className="bar-track" aria-hidden="true">
                <span className="bar-fill" style={{ width: `${(item.count / max) * 100}%` }} />
              </span>
              <span className="bar-value">
                {formatShare(item.count, result.total)} · {formatNumber(item.count)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
