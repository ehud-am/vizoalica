import { useEffect, useRef } from 'react';
import { hrefFor, useRoute, type RouteParams } from '../router.js';
import {
  CampaignRankingTable,
  CampaignRowsTable,
  CampaignTrend
} from '../components/CampaignTables.js';
import { formatNumber } from '../format.js';
import { AnalyticsFrame } from './AnalyticsFrame.js';
import { useCampaignsReport } from './useCampaignsReport.js';

const href = (params: RouteParams) => hrefFor('analytics/campaigns', undefined, params);
const FILTERS = [
  ['source', 'Source'],
  ['medium', 'Medium'],
  ['campaign', 'Campaign']
] as const;

function FilterChips({ params }: { params: RouteParams }) {
  return (
    <ul className="filter-chips" aria-label="Current selection">
      {FILTERS.filter(([name]) => params[name]).map(([name, label]) => {
        const { [name]: _removed, ...rest } = params;
        return (
          <li className="chip" key={name}>
            <span>
              {label}: <strong>{params[name]}</strong>
            </span>
            <a href={href(rest)} aria-label={`Remove ${label.toLowerCase()} filter`}>
              <span aria-hidden="true">×</span>
            </a>
          </li>
        );
      })}
    </ul>
  );
}

/** Share of all page views that came from a tagged link, as a whole percent (at least 1 when any did). */
function share(part: number, whole: number): string {
  if (whole <= 0 || part <= 0) return '0%';
  return `${Math.max(1, Math.round((part / whole) * 100))}%`;
}

/**
 * Which tagged links (UTM source, medium and campaign) brought visitors. View-only. Choosing a
 * source, medium or campaign narrows the report and is kept in the address, so a view can be
 * bookmarked or shared.
 */
export function CampaignsPage() {
  const { params } = useRoute();
  const selection: RouteParams = params ?? {};
  const state = useCampaignsReport(params);
  // Choosing a label removes the link that had focus. Move focus to the main region, whose content
  // just changed, so keyboard and screen-reader users stay in place.
  const selectionKey = `${selection.source ?? ''}\u0000${selection.medium ?? ''}\u0000${selection.campaign ?? ''}`;
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) firstRender.current = false;
    else document.getElementById('main')?.focus();
  }, [selectionKey]);
  const { report } = state;
  const selected = Boolean(selection.source || selection.medium || selection.campaign);

  return (
    <AnalyticsFrame
      page="campaigns"
      title="Campaigns"
      description="Which tagged links brought visitors: page views and visitors by UTM source, medium and campaign."
      status={state.status}
      error={state.error}
      onRetry={state.retry}
      notices={
        report?.availability.state === 'incomplete' && (
          <p className="notice" role="status">
            Campaign reports began
            {report.availability.availableFromUtc
              ? ` on ${new Date(report.availability.availableFromUtc).toLocaleString()}`
              : ''}
            . Earlier page views in this range are not included.
          </p>
        )
      }
    >
      {report && (
        <>
          {selected && <FilterChips params={selection} />}
          <p className="sr-only" role="status">
            {selected
              ? `Showing ${formatNumber(report.totals.pageViews)} campaign page views for the current selection.`
              : `Showing ${formatNumber(report.totals.pageViews)} campaign page views.`}
          </p>
          {report.totals.pageViews === 0 && report.rows.length === 0 ? (
            <section className="dashboard-card" aria-label="No campaigns">
              <p className="chart-empty" role="status">
                {selected ? (
                  <>
                    No campaign page views match this selection in this range.{' '}
                    <a href={href({})}>Show all campaigns</a>
                  </>
                ) : (
                  <>
                    No page views from tagged links in this range yet. Add <code>utm_source</code>,{' '}
                    <code>utm_medium</code> and <code>utm_campaign</code> to the links you share,
                    for example{' '}
                    <code>
                      ?utm_source=newsletter&amp;utm_medium=email&amp;utm_campaign=spring-sale
                    </code>
                    ; see <a href="https://vizoalica.dev/operations/campaigns">Campaigns</a> for
                    details. The website must run the updated SDK, and the backend must be updated
                    first.
                  </>
                )}
              </p>
            </section>
          ) : (
            <>
              <dl className="summary-strip" aria-label="Totals">
                <div>
                  <dt>Campaign page views</dt>
                  <dd>{formatNumber(report.totals.pageViews)}</dd>
                </div>
                <div>
                  <dt>Visitors</dt>
                  <dd>{formatNumber(report.totals.uniqueUsers)}</dd>
                </div>
                <div>
                  <dt>Share of all page views</dt>
                  <dd>{share(report.totals.pageViews, report.totals.allPageViews)}</dd>
                </div>
              </dl>
              <div className="dashboard-grid single">
                <CampaignTrend points={report.trend} />
                <CampaignRankingTable
                  dimension="source"
                  ranking={report.sources}
                  selection={selection}
                />
                <CampaignRankingTable
                  dimension="medium"
                  ranking={report.mediums}
                  selection={selection}
                />
                <CampaignRankingTable
                  dimension="campaign"
                  ranking={report.campaigns}
                  selection={selection}
                />
                <CampaignRowsTable rows={report.rows} other={report.other} selection={selection} />
              </div>
            </>
          )}
        </>
      )}
    </AnalyticsFrame>
  );
}
