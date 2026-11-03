import { formatNumber } from '../format.js';
import { hrefFor } from '../router.js';
import { useScope } from '../scope/ScopeProvider.js';
import { AnalyticsFrame } from './AnalyticsFrame.js';
import { useGoalsReport } from './useGoalsReport.js';

const KIND_LABEL = { page: 'Page view', action: 'Click', event: 'Event' } as const;

/** A fraction as a percent with at most one decimal; a dash when there was no traffic. */
const formatRate = (rate: number | null) =>
  rate === null ? '—' : `${(Math.round(rate * 1000) / 10).toLocaleString()}%`;

/**
 * Conversions of the goals set for one website: page views of a path, clicks of an action, or
 * custom events. View-only; goals are added on the website's page. Counts only, no visitor data.
 */
export function GoalsPage() {
  const { website } = useScope();
  const state = useGoalsReport();
  const { report } = state;

  return (
    <AnalyticsFrame
      page="goals"
      title="Goals"
      description="How many visits reach what matters: a page, a click, or an event you define for a website."
      status={state.status}
      error={state.error}
      onRetry={state.retry}
    >
      {!website ? (
        <section className="dashboard-card" aria-label="Choose a website">
          <p className="chart-empty" role="status">
            Goals belong to one website. Choose a website above to see its goals.
          </p>
        </section>
      ) : (
        report && (
          <>
            <p className="sr-only" role="status">
              Showing {formatNumber(report.goals.length)} goals.
            </p>
            {report.goals.length === 0 ? (
              <section className="dashboard-card" aria-label="No goals">
                <p className="chart-empty" role="status">
                  No goals yet for {website.name}.{' '}
                  <a href={hrefFor('manage/websites/:id', website.id)}>Add a goal</a> on the
                  website’s page.
                </p>
              </section>
            ) : (
              <>
                <dl className="summary-strip" aria-label="Totals">
                  <div>
                    <dt>Visitors</dt>
                    <dd>{formatNumber(report.totals.visitors)}</dd>
                  </div>
                  <div>
                    <dt>Page views</dt>
                    <dd>{formatNumber(report.totals.pageViews)}</dd>
                  </div>
                </dl>
                <section className="dashboard-card ranked-card" aria-labelledby="goals-heading">
                  <h2 id="goals-heading">Conversions</h2>
                  <div className="data-scroll" tabIndex={0} role="region" aria-label="Goals table">
                    <table>
                      <thead>
                        <tr>
                          <th scope="col">Goal</th>
                          <th scope="col">Counts</th>
                          <th scope="col" className="numeric">
                            Conversions
                          </th>
                          <th scope="col" className="numeric">
                            Visitors
                          </th>
                          <th scope="col" className="numeric">
                            Rate
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {report.goals.map((row) => (
                          <tr key={row.goal.id}>
                            <th scope="row">{row.goal.name}</th>
                            <td>
                              {KIND_LABEL[row.goal.kind]} <span className="muted">·</span>{' '}
                              <code>{row.goal.target}</code>
                            </td>
                            <td className="numeric">{formatNumber(row.conversions)}</td>
                            <td className="numeric">
                              {row.visitors === null ? '—' : formatNumber(row.visitors)}
                            </td>
                            <td className="numeric">
                              {formatRate(row.rate)}
                              <span className="sr-only">
                                {row.rateBasis === 'visitors' ? ' of visitors' : ' of page views'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="hint">
                    Rate is converted visitors over all visitors. A page goal counts page views,
                    because views are not kept per visitor, so its rate is its share of all page
                    views and its visitors show a dash. Visitors are counted per day.
                  </p>
                </section>
              </>
            )}
          </>
        )
      )}
    </AnalyticsFrame>
  );
}
