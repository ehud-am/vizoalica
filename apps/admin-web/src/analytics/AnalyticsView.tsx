import type { ReactNode } from 'react';
import type { AnalyticsOverview } from '../api/local-operations.js';
import { hrefFor } from '../router.js';
import { useScope } from '../scope/ScopeProvider.js';
import { AnalyticsFrame } from './AnalyticsFrame.js';
import { useAnalytics } from './AnalyticsProvider.js';

/**
 * A view of the shared overview: the common frame plus the overview's own notices (a range that
 * starts before expanded analytics existed, and the first-run hint when there are no page views).
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
    <AnalyticsFrame
      page={page}
      title={title}
      description={description}
      status={analytics.status}
      error={analytics.error}
      onRetry={analytics.retry}
      notices={
        <>
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
            </p>
          )}
        </>
      }
    >
      {overview && children(overview)}
    </AnalyticsFrame>
  );
}
