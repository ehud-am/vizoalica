import { RageRowsTable, RageTrend } from '../components/RageClickTables.js';
import { formatNumber } from '../format.js';
import { AnalyticsFrame } from './AnalyticsFrame.js';
import { useRageClicksReport } from './useRageClicksReport.js';

/**
 * Where visitors click the same control again and again: bursts of 3 or more rapid clicks on one
 * button or link. View-only. A burst is a count; no visitor and no click position is kept.
 */
export function RageClicksPage() {
  const state = useRageClicksReport();
  const { report } = state;

  return (
    <AnalyticsFrame
      page="rage-clicks"
      title="Rage clicks"
      description="Controls that visitors click repeatedly in quick succession, a sign that something did not respond as expected."
      status={state.status}
      error={state.error}
      onRetry={state.retry}
      notices={
        report?.availability.state === 'incomplete' && (
          <p className="notice" role="status">
            Rage click reports began
            {report.availability.availableFromUtc
              ? ` on ${new Date(report.availability.availableFromUtc).toLocaleString()}`
              : ''}
            . Earlier clicks in this range are not included.
          </p>
        )
      }
    >
      {report && (
        <>
          <p className="sr-only" role="status">
            Showing {formatNumber(report.totals.bursts)} rage click bursts.
          </p>
          {report.totals.bursts === 0 && report.rows.length === 0 ? (
            <section className="dashboard-card" aria-label="No rage clicks">
              <p className="chart-empty" role="status">
                No rage clicks in this range. A burst is 3 or more clicks on one button or link
                within a second. The website must run the updated SDK, and the backend must be
                updated first; see{' '}
                <a href="https://vizoalica.dev/operations/rage-clicks">Rage clicks</a> for details.
              </p>
            </section>
          ) : (
            <>
              <dl className="summary-strip" aria-label="Totals">
                <div>
                  <dt>Rage click bursts</dt>
                  <dd>{formatNumber(report.totals.bursts)}</dd>
                </div>
                <div>
                  <dt>Clicks</dt>
                  <dd>{formatNumber(report.totals.clicks)}</dd>
                </div>
              </dl>
              <div className="dashboard-grid single">
                <RageTrend points={report.trend} />
                <RageRowsTable rows={report.rows} other={report.other} />
              </div>
            </>
          )}
        </>
      )}
    </AnalyticsFrame>
  );
}
