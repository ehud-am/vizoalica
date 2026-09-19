import { useId, useState } from 'react';
import type { RankedResult } from '../api/local-operations.js';
import { formatNumber, formatShare } from '../format.js';

export interface RankedRowLabel {
  name: string;
  /** Shown after the name in muted text, for example a country code. */
  secondary?: string;
}

/**
 * Ranked values with their share of the total. Shows the top ten by default and every row the
 * Worker returned on request; anything beyond that is folded into one "Other" row.
 */
export function RankedList({
  title,
  result,
  countLabel,
  describe = (label) => ({ name: label }),
  initialLimit = 10,
  showAll: forcedShowAll = false,
  moreLink
}: {
  title: string;
  result: RankedResult;
  countLabel: string;
  describe?: (label: string) => RankedRowLabel;
  initialLimit?: number;
  showAll?: boolean;
  /** When set, the full list lives elsewhere and a link replaces the inline expander. */
  moreLink?: { href: string; label: string };
}) {
  const headingId = useId();
  const [expanded, setExpanded] = useState(false);
  const all = forcedShowAll || expanded;
  const rows = all ? result.items : result.items.slice(0, initialLimit);
  const hidden = result.items.length - rows.length;
  const other =
    result.otherCount +
    (all ? 0 : result.items.slice(initialLimit).reduce((sum, row) => sum + row.count, 0));
  return (
    <section className="dashboard-card ranked-card" aria-labelledby={headingId}>
      <h2 id={headingId}>{title}</h2>
      {result.total === 0 ? (
        <p className="chart-empty">No data in this range.</p>
      ) : (
        <>
          <div className="data-scroll" tabIndex={0} role="region" aria-label={`${title} table`}>
            <table>
              <thead>
                <tr>
                  <th scope="col">Value</th>
                  <th scope="col" className="numeric">
                    {countLabel}
                  </th>
                  <th scope="col" className="numeric">
                    Share
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((item) => {
                  const label = describe(item.label);
                  return (
                    <tr key={item.label}>
                      <th scope="row">
                        {label.name}
                        {label.secondary && (
                          <span className="secondary-text"> {label.secondary}</span>
                        )}
                      </th>
                      <td className="numeric">{formatNumber(item.count)}</td>
                      <td className="numeric">{formatShare(item.count, result.total)}</td>
                    </tr>
                  );
                })}
                {other > 0 && (
                  <tr>
                    <th scope="row">Other</th>
                    <td className="numeric">{formatNumber(other)}</td>
                    <td className="numeric">{formatShare(other, result.total)}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {moreLink && (result.items.length > initialLimit || result.otherCount > 0) && (
            <a className="link-button" href={moreLink.href}>
              {moreLink.label}
            </a>
          )}
          {!moreLink && !forcedShowAll && result.items.length > initialLimit && (
            <button
              className="link-button"
              type="button"
              aria-expanded={expanded}
              onClick={() => setExpanded((value) => !value)}
            >
              {expanded
                ? `Show top ${initialLimit}`
                : `Show all ${result.items.length} (${hidden} more)`}
            </button>
          )}
        </>
      )}
    </section>
  );
}
