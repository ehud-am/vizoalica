import { useEffect, useRef } from 'react';
import { hrefFor, useRoute, type RouteParams } from '../router.js';
import { useScope } from '../scope/ScopeProvider.js';
import { ActionsTable, ActionTotalsTable } from '../components/ActionsTable.js';
import { formatNumber, formatShare } from '../format.js';
import { AnalyticsFrame } from './AnalyticsFrame.js';
import { useActionsReport } from './useActionsReport.js';

const href = (params: RouteParams) => hrefFor('analytics/actions', undefined, params);

function FilterChips({ params }: { params: RouteParams }) {
  return (
    <ul className="filter-chips" aria-label="Current selection">
      {params.page && (
        <li className="chip">
          <span>
            Page: <strong>{params.page}</strong>
          </span>
          <a
            href={href({ ...(params.action ? { action: params.action } : {}) })}
            aria-label="Remove page filter"
          >
            <span aria-hidden="true">×</span>
          </a>
        </li>
      )}
      {params.action && (
        <li className="chip">
          <span>
            Action: <strong>{params.action}</strong>
          </span>
          <a
            href={href({ ...(params.page ? { page: params.page } : {}) })}
            aria-label="Remove action filter"
          >
            <span aria-hidden="true">×</span>
          </a>
        </li>
      )}
    </ul>
  );
}

/**
 * What visitors click, page by page. View-only: nothing here changes a setting. Choosing a page or
 * an action narrows the report and is kept in the address, so a view can be bookmarked or shared.
 */
export function ActionsPage() {
  const scope = useScope();
  const { params } = useRoute();
  const selection: RouteParams = params ?? {};
  const state = useActionsReport(params);
  // Choosing a page or action removes the link that had focus. Keep keyboard and screen-reader
  // users in place by moving focus to the main region, whose content just changed.
  const selectionKey = `${selection.page ?? ''}\u0000${selection.action ?? ''}`;
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) firstRender.current = false;
    else document.getElementById('main')?.focus();
  }, [selectionKey]);
  const { report } = state;
  const selected = Boolean(selection.page || selection.action);
  const page = report?.selection?.page;

  return (
    <AnalyticsFrame
      page="actions"
      title="Actions"
      description="What visitors click on each page: buttons, links, and controls that work like them."
      status={state.status}
      error={state.error}
      onRetry={state.retry}
      notices={
        report?.availability.state === 'incomplete' && (
          <p className="notice" role="status">
            This range starts before expanded analytics were available
            {report.availability.availableFromUtc
              ? ` on ${new Date(report.availability.availableFromUtc).toLocaleString()}`
              : ''}
            . Available results are shown.
          </p>
        )
      }
    >
      {report && (
        <>
          {selected && <FilterChips params={selection} />}
          <p className="sr-only" role="status">
            {selected
              ? `Showing ${formatNumber(report.totals.actions)} actions for the current selection.`
              : `Showing ${formatNumber(report.totals.actions)} actions across all pages.`}
          </p>
          {page && (
            <dl className="summary-strip" aria-label="Selected page">
              <div>
                <dt>Page views</dt>
                <dd>{formatNumber(page.views)}</dd>
              </div>
              <div>
                <dt>Actions on this page</dt>
                <dd>{formatNumber(page.actions)}</dd>
              </div>
              <div>
                <dt>Actions per page view</dt>
                <dd>{page.views > 0 ? formatShare(page.actions, page.views) : '—'}</dd>
              </div>
            </dl>
          )}
          {report.totals.actions === 0 ? (
            <section className="dashboard-card" aria-label="No actions">
              <p className="chart-empty" role="status">
                {selected
                  ? 'No actions match this selection in this range. '
                  : 'No actions in this range yet. '}
                {selected ? (
                  <a href={href({})}>Show all actions</a>
                ) : (
                  <>
                    An action is a click on a button, a link, or a control that works like one.
                    Actions are reported by websites running the updated SDK; if you have just
                    installed or updated it,{' '}
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
            <div className="dashboard-grid single">
              <ActionsTable rows={report.rows} other={report.other} selection={selection} />
              <ActionTotalsTable actions={report.actions} selection={selection} />
            </div>
          )}
        </>
      )}
    </AnalyticsFrame>
  );
}
