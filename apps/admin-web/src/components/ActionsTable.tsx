import { useId } from 'react';
import type { ActionReportRow, ActionTotal, ActionKind } from '../api/local-operations.js';
import { formatNumber, formatShare } from '../format.js';
import { hrefFor, type RouteParams } from '../router.js';

const KIND_LABEL: Record<ActionKind, string> = { button: 'Button', link: 'Link', other: 'Other' };
const actionsHref = (params: RouteParams) => hrefFor('analytics/actions', undefined, params);

/**
 * Page-and-action rows, most used first. A page or an action name is a real link that narrows the
 * report to it, so the choice lives in the address and works from the keyboard.
 */
export function ActionsTable({
  rows,
  other,
  selection
}: {
  rows: ActionReportRow[];
  other: { rows: number; count: number };
  selection: RouteParams;
}) {
  const headingId = useId();
  return (
    <section className="dashboard-card ranked-card" aria-labelledby={headingId}>
      <h2 id={headingId}>Actions on pages</h2>
      <div className="data-scroll" tabIndex={0} role="region" aria-label="Actions on pages table">
        <table>
          <thead>
            <tr>
              <th scope="col">Page</th>
              <th scope="col">Action</th>
              <th scope="col">Kind</th>
              <th scope="col" className="numeric">
                Actions
              </th>
              <th scope="col" className="numeric">
                Visitors
              </th>
              <th scope="col" className="numeric">
                Actions per page view
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={`${row.page}\u0000${row.action}\u0000${row.kind}\u0000${row.destination ?? ''}`}
              >
                <th scope="row" className="page-cell">
                  <a href={actionsHref({ ...selection, page: row.page })}>{row.page}</a>
                </th>
                <td>
                  <a href={actionsHref({ ...selection, action: row.action })}>{row.action}</a>
                  {row.destination && (
                    <span className="secondary-text" title={row.destination}>
                      {' '}
                      to {row.destination}
                    </span>
                  )}
                </td>
                <td>{KIND_LABEL[row.kind]}</td>
                <td className="numeric">{formatNumber(row.count)}</td>
                <td className="numeric">{formatNumber(row.visitors)}</td>
                <td className="numeric">
                  {row.pageViews > 0 ? (
                    formatShare(row.count, row.pageViews)
                  ) : (
                    <span aria-label="No page views recorded for this page">—</span>
                  )}
                </td>
              </tr>
            ))}
            {other.count > 0 && (
              <tr>
                <th scope="row">Other</th>
                <td>
                  {formatNumber(other.rows)} more page and action{' '}
                  {other.rows === 1 ? 'pair' : 'pairs'}
                </td>
                <td />
                <td className="numeric">{formatNumber(other.count)}</td>
                <td />
                <td />
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** The same actions summed across every page they appear on. */
export function ActionTotalsTable({
  actions,
  selection
}: {
  actions: ActionTotal[];
  selection: RouteParams;
}) {
  const headingId = useId();
  return (
    <section className="dashboard-card ranked-card" aria-labelledby={headingId}>
      <h2 id={headingId}>Most used actions across pages</h2>
      <div
        className="data-scroll"
        tabIndex={0}
        role="region"
        aria-label="Most used actions across pages table"
      >
        <table>
          <thead>
            <tr>
              <th scope="col">Action</th>
              <th scope="col">Kind</th>
              <th scope="col" className="numeric">
                Actions
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
            {actions.map((entry) => (
              <tr key={`${entry.action}\u0000${entry.kind}`}>
                <th scope="row">
                  <a href={actionsHref({ ...selection, action: entry.action })}>{entry.action}</a>
                </th>
                <td>{KIND_LABEL[entry.kind]}</td>
                <td className="numeric">{formatNumber(entry.count)}</td>
                <td className="numeric">{formatNumber(entry.visitors)}</td>
                <td className="numeric">{formatNumber(entry.pages)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
