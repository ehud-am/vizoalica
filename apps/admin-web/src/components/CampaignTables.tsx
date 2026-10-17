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
import type { CampaignsReport } from '../api/local-operations.js';
import { formatNumber } from '../format.js';
import { hrefFor, type RouteParams } from '../router.js';

const campaignsHref = (params: RouteParams) => hrefFor('analytics/campaigns', undefined, params);
export const NOT_SET = '(not set)';

type Dimension = 'source' | 'medium' | 'campaign';
const TITLES: Record<Dimension, string> = {
  source: 'Sources',
  medium: 'Mediums',
  campaign: 'Campaigns'
};

/**
 * One of the three rankings. A label is a link that narrows the report to it; a label the link
 * did not set has nothing to narrow to, so it is plain text.
 */
export function CampaignRankingTable({
  dimension,
  ranking,
  selection
}: {
  dimension: Dimension;
  ranking: CampaignsReport['sources'];
  selection: RouteParams;
}) {
  const headingId = useId();
  const title = TITLES[dimension];
  return (
    <section className="dashboard-card ranked-card" aria-labelledby={headingId}>
      <h2 id={headingId}>{title}</h2>
      {ranking.items.length === 0 ? (
        <p className="chart-empty">Nothing in this selection.</p>
      ) : (
        <div className="data-scroll" tabIndex={0} role="region" aria-label={`${title} table`}>
          <table>
            <thead>
              <tr>
                <th scope="col">{title.slice(0, -1)}</th>
                <th scope="col" className="numeric">
                  Page views
                </th>
                <th scope="col" className="numeric">
                  Visitors
                </th>
              </tr>
            </thead>
            <tbody>
              {ranking.items.map((entry) => (
                <tr key={entry.label}>
                  <th scope="row">
                    {entry.label ? (
                      <a href={campaignsHref({ ...selection, [dimension]: entry.label })}>
                        {entry.label}
                      </a>
                    ) : (
                      NOT_SET
                    )}
                  </th>
                  <td className="numeric">{formatNumber(entry.count)}</td>
                  <td className="numeric">{formatNumber(entry.visitors)}</td>
                </tr>
              ))}
              {ranking.otherCount > 0 && (
                <tr>
                  <th scope="row">Other</th>
                  <td className="numeric">{formatNumber(ranking.otherCount)}</td>
                  <td />
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/** The source, medium and campaign combinations that brought the most page views. */
export function CampaignRowsTable({
  rows,
  other,
  selection
}: {
  rows: CampaignsReport['rows'];
  other: CampaignsReport['other'];
  selection: RouteParams;
}) {
  const headingId = useId();
  const link = (dimension: Dimension, value: string) =>
    value ? <a href={campaignsHref({ ...selection, [dimension]: value })}>{value}</a> : NOT_SET;
  return (
    <section className="dashboard-card ranked-card" aria-labelledby={headingId}>
      <h2 id={headingId}>Top combinations</h2>
      <div className="data-scroll" tabIndex={0} role="region" aria-label="Top combinations table">
        <table>
          <thead>
            <tr>
              <th scope="col">Source</th>
              <th scope="col">Medium</th>
              <th scope="col">Campaign</th>
              <th scope="col" className="numeric">
                Page views
              </th>
              <th scope="col" className="numeric">
                Visitors
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={`${row.source}\u0000${row.medium}\u0000${row.campaign}`}>
                <th scope="row">{link('source', row.source)}</th>
                <td>{link('medium', row.medium)}</td>
                <td>{link('campaign', row.campaign)}</td>
                <td className="numeric">{formatNumber(row.count)}</td>
                <td className="numeric">{formatNumber(row.visitors)}</td>
              </tr>
            ))}
            {other.count > 0 && (
              <tr>
                <th scope="row">Other</th>
                <td colSpan={2}>
                  {formatNumber(other.rows)} more{' '}
                  {other.rows === 1 ? 'combination' : 'combinations'}
                </td>
                <td className="numeric">{formatNumber(other.count)}</td>
                <td />
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** Page views that carried a campaign in each interval of the range. */
export function CampaignTrend({ points }: { points: CampaignsReport['trend'] }) {
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
        <h2>Campaign page views over time</h2>
        <p>
          Page views that came from a tagged link within each interval of the current selection.
        </p>
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
              dataKey="pageViews"
              name="Page views"
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
        aria-label="Exact campaign page view values"
      >
        <table className="chart-data">
          <caption>Exact campaign page view values</caption>
          <thead>
            <tr>
              <th scope="col">Interval</th>
              <th scope="col">Page views</th>
            </tr>
          </thead>
          <tbody>
            {data.map((point) => (
              <tr key={point.startUtc}>
                <th scope="row">{point.label}</th>
                <td>{point.pageViews}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}
