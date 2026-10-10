import { useEffect, useRef } from 'react';
import { hrefFor, useRoute, type RouteParams } from '../router.js';
import { useScope } from '../scope/ScopeProvider.js';
import {
  EventPagesTable,
  EventProperties,
  EventsTable,
  EventsTrend
} from '../components/CustomEventsTables.js';
import { formatNumber } from '../format.js';
import { AnalyticsFrame } from './AnalyticsFrame.js';
import { useCustomEventsReport } from './useCustomEventsReport.js';

const href = (params: RouteParams) => hrefFor('analytics/events', undefined, params);

function FilterChips({ params }: { params: RouteParams }) {
  return (
    <ul className="filter-chips" aria-label="Current selection">
      {params.event && (
        <li className="chip">
          <span>
            Event: <strong>{params.event}</strong>
          </span>
          <a
            href={href({ ...(params.page ? { page: params.page } : {}) })}
            aria-label="Remove event filter"
          >
            <span aria-hidden="true">×</span>
          </a>
        </li>
      )}
      {params.page && (
        <li className="chip">
          <span>
            Page: <strong>{params.page}</strong>
          </span>
          <a
            href={href({ ...(params.event ? { event: params.event } : {}) })}
            aria-label="Remove page filter"
          >
            <span aria-hidden="true">×</span>
          </a>
        </li>
      )}
    </ul>
  );
}

/**
 * The events a website sends with `vizoalica.track()`: how often, by how many visitors, from which
 * pages, and with which property values. View-only. Choosing an event or a page narrows the report
 * and is kept in the address, so a view can be bookmarked or shared.
 */
export function EventsPage() {
  const scope = useScope();
  const { params } = useRoute();
  const selection: RouteParams = params ?? {};
  const state = useCustomEventsReport(params);
  // Choosing an event or page removes the link that had focus. Move focus to the main region,
  // whose content just changed, so keyboard and screen-reader users stay in place.
  const selectionKey = `${selection.event ?? ''}\u0000${selection.page ?? ''}`;
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) firstRender.current = false;
    else document.getElementById('main')?.focus();
  }, [selectionKey]);
  const { report } = state;
  const selected = Boolean(selection.event || selection.page);

  return (
    <AnalyticsFrame
      page="events"
      title="Events"
      description="Custom events a website sends, such as signups or downloads: how often, from which pages, and with which values."
      status={state.status}
      error={state.error}
      onRetry={state.retry}
      notices={
        report?.availability.state === 'incomplete' && (
          <p className="notice" role="status">
            Event reports began
            {report.availability.availableFromUtc
              ? ` on ${new Date(report.availability.availableFromUtc).toLocaleString()}`
              : ''}
            . Earlier events in this range are not included.
          </p>
        )
      }
    >
      {report && (
        <>
          {selected && <FilterChips params={selection} />}
          <p className="sr-only" role="status">
            {selected
              ? `Showing ${formatNumber(report.totals.events)} events for the current selection.`
              : `Showing ${formatNumber(report.totals.events)} events across all pages.`}
          </p>
          {report.totals.events === 0 && report.events.length === 0 ? (
            <section className="dashboard-card" aria-label="No events">
              <p className="chart-empty" role="status">
                {selected ? (
                  <>
                    No events match this selection in this range.{' '}
                    <a href={href({})}>Show all events</a>
                  </>
                ) : (
                  <>
                    No events in this range yet. A website sends one with{' '}
                    <code>vizoalica.track(&apos;signup&apos;)</code>; see{' '}
                    <a href="https://vizoalica.dev/operations/custom-events">Custom events</a> for
                    an example. If you have just installed or updated the SDK,{' '}
                    <a
                      href={
                        scope.website
                          ? hrefFor('manage/websites/:id/install', scope.website.id)
                          : hrefFor('manage/websites')
                      }
                    >
                      check the installation
                    </a>{' '}
                    and <a href={hrefFor('manage/health')}>website health</a>.
                  </>
                )}
              </p>
            </section>
          ) : (
            <>
              <dl className="summary-strip" aria-label="Totals">
                <div>
                  <dt>Events</dt>
                  <dd>{formatNumber(report.totals.events)}</dd>
                </div>
                <div>
                  <dt>Visitors</dt>
                  <dd>{formatNumber(report.totals.uniqueUsers)}</dd>
                </div>
              </dl>
              <div className="dashboard-grid single">
                <EventsTrend points={report.trend} />
                <EventsTable events={report.events} other={report.other} selection={selection} />
                <EventPagesTable
                  pages={report.pages}
                  withoutPage={report.withoutPage}
                  selection={selection}
                />
                {selection.event && <EventProperties properties={report.properties} />}
              </div>
            </>
          )}
        </>
      )}
    </AnalyticsFrame>
  );
}
