import type { ReactNode } from 'react';
import { NoProject } from '../components/NoProject.js';
import { useScope } from '../scope/ScopeProvider.js';
import { AnalyticsSetupHint } from '../setup/Journey.js';
import { rangeSummary } from '../time-range.js';

export type FrameStatus = 'idle' | 'loading' | 'ready' | 'error';

/**
 * Common frame of every Analytics view: heading, the no-project state, an error with retry,
 * loading placeholders that keep the layout, and a slot for notices. Its children render only once
 * the data is ready, so no view ever shows stale or partial results.
 */
export function AnalyticsFrame({
  page,
  title,
  description,
  status,
  error,
  onRetry,
  notices,
  children
}: {
  page: string;
  title: string;
  description: string;
  status: FrameStatus;
  error: string;
  onRetry: () => void;
  notices?: ReactNode;
  children: ReactNode;
}) {
  const scope = useScope();
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
          <div className="dashboard-status" aria-live="polite" aria-busy={status === 'loading'}>
            {status === 'error' && (
              <p className="notice error" role="alert">
                {error}{' '}
                <button className="link-button" type="button" onClick={onRetry}>
                  Try again
                </button>
              </p>
            )}
            {notices}
            <AnalyticsSetupHint />
          </div>
          {status === 'loading' && (
            <div className="dashboard-grid skeleton-grid" aria-hidden="true">
              {Array.from({ length: 4 }, (_, index) => (
                <div key={index} className="dashboard-card skeleton" />
              ))}
            </div>
          )}
          {status === 'ready' && children}
        </>
      )}
    </div>
  );
}
