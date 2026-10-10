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
import type { CustomEventsReport } from '../api/local-operations.js';
import { formatNumber } from '../format.js';
import { hrefFor, type RouteParams } from '../router.js';

const eventsHref = (params: RouteParams) => hrefFor('analytics/events', undefined, params);

/** Every event name with its use, most frequent first. A name is a link that narrows the report. */
export function EventsTable({
  events,
  other,
  selection
}: {
  events: CustomEventsReport['events'];
  other: CustomEventsReport['other'];
  selection: RouteParams;
}) {
  const headingId = useId();
  return (
    <section className="dashboard-card ranked-card" aria-labelledby={headingId}>
      <h2 id={headingId}>Events</h2>
      <div className="data-scroll" tabIndex={0} role="region" aria-label="Events table">
        <table>
          <thead>
            <tr>
              <th scope="col">Event</th>
              <th scope="col" className="numeric">
                Count
              </th>
              <th scope="col" className="numeric">
                Visitors
              </th>
              <th scope="col" className="numeric">
                Pages
              </th>
            </tr>
          </thead>
          <tbody>
            {events.map((entry) => (
              <tr key={entry.event}>
                <th scope="row">
                  <a href={eventsHref({ ...selection, event: entry.event })}>{entry.event}</a>
                </th>
                <td className="numeric">{formatNumber(entry.count)}</td>
                <td className="numeric">{formatNumber(entry.visitors)}</td>
                <td className="numeric">{formatNumber(entry.pages)}</td>
              </tr>
            ))}
            {other.count > 0 && (
              <tr>
                <th scope="row">Other</th>
                <td className="numeric">{formatNumber(other.count)}</td>
                <td />
                <td className="numeric">
                  {formatNumber(other.events)} more {other.events === 1 ? 'event' : 'events'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** The pages the selected events were sent from. A page is a link that narrows the report. */
export function EventPagesTable({
  pages,
  withoutPage,
  selection
}: {
  pages: CustomEventsReport['pages'];
  withoutPage: number;
  selection: RouteParams;
}) {
  const headingId = useId();
  return (
    <section className="dashboard-card ranked-card" aria-labelledby={headingId}>
      <h2 id={headingId}>Top pages</h2>
      {pages.length === 0 ? (
        <p className="chart-empty">No page was reported for these events.</p>
      ) : (
        <div className="data-scroll" tabIndex={0} role="region" aria-label="Top pages table">
          <table>
            <thead>
              <tr>
                <th scope="col">Page</th>
                <th scope="col" className="numeric">
                  Count
                </th>
                <th scope="col" className="numeric">
                  Visitors
                </th>
              </tr>
            </thead>
            <tbody>
              {pages.map((entry) => (
                <tr key={entry.page}>
                  <th scope="row" className="page-cell">
                    <a href={eventsHref({ ...selection, page: entry.page })}>{entry.page}</a>
                  </th>
                  <td className="numeric">{formatNumber(entry.count)}</td>
                  <td className="numeric">{formatNumber(entry.visitors)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {withoutPage > 0 && (
        <p className="secondary-text">
          {formatNumber(withoutPage)} {withoutPage === 1 ? 'event was' : 'events were'} sent without
          a page, for example by a website running an older SDK.
        </p>
      )}
    </section>
  );
}

/** How often the selected event(s) happened in each interval of the range. */
export function EventsTrend({ points }: { points: CustomEventsReport['trend'] }) {
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
        <h2>Events over time</h2>
        <p>How often the events in the current selection happened within each interval.</p>
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
              dataKey="count"
              name="Events"
              stroke="var(--color-chart-1)"
              strokeWidth={3}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="data-scroll" tabIndex={0} role="region" aria-label="Exact event values">
        <table className="chart-data">
          <caption>Exact event values</caption>
          <thead>
            <tr>
              <th scope="col">Interval</th>
              <th scope="col">Events</th>
            </tr>
          </thead>
          <tbody>
            {data.map((point) => (
              <tr key={point.startUtc}>
                <th scope="row">{point.label}</th>
                <td>{point.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}

/** The most common values of each property sent with the selected event. */
export function EventProperties({ properties }: { properties: CustomEventsReport['properties'] }) {
  const headingId = useId();
  return (
    <section className="dashboard-card ranked-card" aria-labelledby={headingId}>
      <h2 id={headingId}>Property values</h2>
      {properties.length === 0 ? (
        <p className="chart-empty">
          This event has no text or true/false properties. Numbers are not grouped.
        </p>
      ) : (
        <div className="data-scroll" tabIndex={0} role="region" aria-label="Property values table">
          <table>
            <thead>
              <tr>
                <th scope="col">Property</th>
                <th scope="col">Value</th>
                <th scope="col" className="numeric">
                  Count
                </th>
              </tr>
            </thead>
            <tbody>
              {properties.flatMap((property) =>
                property.values.map((entry, index) => (
                  <tr key={`${property.key}\u0000${entry.value}`}>
                    {index === 0 ? (
                      <th scope="row" rowSpan={property.values.length}>
                        {property.key}
                      </th>
                    ) : null}
                    <td>{entry.value}</td>
                    <td className="numeric">{formatNumber(entry.count)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
