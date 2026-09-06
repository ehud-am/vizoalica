import type { Summary, Window } from '../api/local-operations.js';
export function AnalyticsSummary({
  summary,
  window,
  loading,
  onWindowChange
}: {
  summary: Summary | undefined;
  window: Window;
  loading: boolean;
  onWindowChange: (value: Window) => void;
}) {
  return (
    <>
      <div className="segmented" aria-label="Analytics window">
        {(['24h', '7d', '30d'] as Window[]).map((value) => (
          <button key={value} aria-pressed={window === value} onClick={() => onWindowChange(value)}>
            {value === '24h' ? '24 hours' : value === '7d' ? '7 days' : '30 days'}
          </button>
        ))}
      </div>
      <div className="metrics" aria-live="polite" aria-busy={loading}>
        {loading ? (
          <p className="metric-empty">Loading current totals…</p>
        ) : summary?.availability === 'unavailable' ? (
          <p className="metric-empty" role="alert">
            Analytics are currently unavailable. No stale totals are shown.
          </p>
        ) : summary ? (
          <>
            <article className="metric">
              <span>Page views</span>
              <strong>{summary.pageViews?.toLocaleString() ?? '—'}</strong>
              <small>Accepted page-view events</small>
            </article>
            <article className="metric">
              <span>Unique users</span>
              <strong>{summary.uniqueUsers?.toLocaleString() ?? '—'}</strong>
              <small>Private, deduplicated visitors</small>
            </article>
          </>
        ) : (
          <p className="metric-empty">Choose a website to view its analytics.</p>
        )}
      </div>
      {summary?.availability === 'processing' && (
        <p className="notice" role="status">
          Results are still processing and may be incomplete
          {summary.lastCompletedAggregateAt
            ? ` through ${new Date(summary.lastCompletedAggregateAt).toLocaleString()}`
            : ''}
          .
        </p>
      )}
    </>
  );
}
