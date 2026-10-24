import { useId } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import type { RageClicksReport } from '../api/local-operations.js';
import { formatNumber } from '../format.js';
import { hrefFor } from '../router.js';

/** Bursts per 100 clicks, as a whole percent (at least 1 when there were any bursts). */
export function burstRate(bursts: number, clicks: number): string {
  if (bursts <= 0) return '0%';
  if (clicks <= 0) return '—';
  return `${Math.max(1, Math.round((bursts / clicks) * 100))}%`;
}

/** The controls with the most bursts of rapid clicks. */
export function RageRowsTable({
  rows,
  other
}: {
  rows: RageClicksReport['rows'];
  other: RageClicksReport['other'];
}) {
  const headingId = useId();
  return (
    <section className="dashboard-card ranked-card" aria-labelledby={headingId}>
      <h2 id={headingId}>Controls with rage clicks</h2>
      <div
        className="data-scroll"
        tabIndex={0}
        role="region"
        aria-label="Controls with rage clicks table"
      >
        <table>
          <thead>
            <tr>
              <th scope="col">Control</th>
              <th scope="col">Page</th>
              <th scope="col" className="numeric">
                Bursts
              </th>
              <th scope="col" className="numeric">
                Clicks
              </th>
              <th scope="col" className="numeric">
                Bursts per click
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={`${row.page}\u0000${row.action}\u0000${row.kind}\u0000${row.destination ?? ''}`}
              >
                <th scope="row">
                  <a
                    href={hrefFor('analytics/actions', undefined, {
                      page: row.page,
                      action: row.action
                    })}
                  >
                    {row.action}
                  </a>{' '}
                  <span className="muted">({row.kind})</span>
                </th>
                <td>{row.page}</td>
                <td className="numeric">{formatNumber(row.count)}</td>
                <td className="numeric">{formatNumber(row.clicks)}</td>
                <td className="numeric">{burstRate(row.count, row.clicks)}</td>
              </tr>
            ))}
            {other.count > 0 && (
              <tr>
                <th scope="row">Other</th>
                <td>
                  {formatNumber(other.rows)} more {other.rows === 1 ? 'control' : 'controls'}
                </td>
                <td className="numeric">{formatNumber(other.count)}</td>
                <td />
                <td />
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** Bursts in each interval of the range. */
export function RageTrend({ points }: { points: RageClicksReport['trend'] }) {
  const data = points.map((point) => ({
    ...point,
    label: new Date(point.startUtc).toLocaleString([], {
      month: 'short',
      day: 'numeric',
      hour: 'numeric'
    })
  }));
  return (
    <figure className="dashboard-card trend-card">
      <figcaption>
        <h2>Rage click bursts over time</h2>
        <p>Bursts of rapid clicks on one control within each interval of the current selection.</p>
      </figcaption>
      <div className="chart-canvas" aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} accessibilityLayer={false}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="label" />
            <YAxis allowDecimals={false} />
            <Tooltip />
            <Line
              type="monotone"
              dataKey="bursts"
              name="Bursts"
              stroke="var(--color-chart-1)"
              strokeWidth={3}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div
        className="data-scroll"
        tabIndex={0}
        role="region"
        aria-label="Exact rage click burst values"
      >
        <table className="chart-data">
          <caption>Exact rage click burst values</caption>
          <thead>
            <tr>
              <th scope="col">Interval</th>
              <th scope="col">Bursts</th>
            </tr>
          </thead>
          <tbody>
            {data.map((point) => (
              <tr key={point.startUtc}>
                <th scope="row">{point.label}</th>
                <td>{point.bursts}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}
