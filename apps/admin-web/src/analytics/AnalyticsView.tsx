import type { ReactNode } from 'react';
import type { AnalyticsOverview } from '../api/local-operations.js';
import { NoProject } from '../components/NoProject.js';
import { hrefFor } from '../router.js';
import { useScope } from '../scope/ScopeProvider.js';
import { rangeSummary } from '../time-range.js';
import { useAnalytics } from './AnalyticsProvider.js';

/**
 * Common frame of every Analytics view: heading, loading placeholders that keep the layout,
 * an error with retry, the incomplete-range notice, and the first-run hint.
 */
export function AnalyticsView({
  page,
  title,
  description,
  children
}: {
  page: string;
  title: string;
  description: string;
  children: (overview: AnalyticsOverview) => ReactNode;
}) {
  const scope = useScope();
  const analytics = useAnalytics();
  const { overview } = analytics;
  return (
    <div className="page dashboard-page" data-page={page}>
      <div className="page-heading">
        <div>
          <p className="eyebrow">
            Analytics · {scope.website ? scope.website.name : (scope.project?.name ?? 'No project')}
          </p>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
        {scope.projectId && (
          <span className="sr-only" aria-live="polite">
            {rangeSummary(scope.range)}
          </span>
        )}
      </div>

      {!scope.projectId ? (
        <NoProject />
      ) : (
        <>
          <div
            className="dashboard-status"
            aria-live="polite"
            aria-busy={analytics.status === 'loading'}
          >
            {analytics.status === 'error' && (
              <p className="notice error" role="alert">
                {analytics.error}{' '}
                <button className="link-button" type="button" onClick={analytics.retry}>
                  Try again
                </button>
              </p>
            )}
            {overview?.availability.state === 'incomplete' && (
              <p className="notice" role="status">
                This range starts before expanded analytics were available
                {overview.availability.availableFromUtc
                  ? ` on ${new Date(overview.availability.availableFromUtc).toLocaleString()}`
                  : ''}
                . Available results are shown.
              </p>
            )}
            {overview && overview.totals.pageViews === 0 && (
              <p className="notice" role="status">
                {scope.website
                  ? `No page views from ${scope.website.name} in this range yet. `
                  : 'No page views in this range yet. '}
                If you have just installed the snippet,{' '}
                <a href={hrefFor('manage/installation')}>check the installation</a> and{' '}
                <a href={hrefFor('manage/health')}>website health</a>.
              </p>
            )}
          </div>
          {analytics.status === 'loading' && (
            <div className="dashboard-grid skeleton-grid" aria-hidden="true">
              {Array.from({ length: 4 }, (_, index) => (
                <div key={index} className="dashboard-card skeleton" />
              ))}
            </div>
          )}
          {overview && analytics.status === 'ready' && children(overview)}
        </>
      )}
    </div>
  );
}
