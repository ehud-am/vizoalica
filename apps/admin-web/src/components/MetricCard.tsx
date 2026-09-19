import { describeChange, type MetricComparison } from '../analytics/comparison.js';
import { formatNumber } from '../format.js';

function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const max = Math.max(...values, 1);
  const points = values
    .map((value, index) => `${(index / (values.length - 1)) * 100},${28 - (value / max) * 26}`)
    .join(' ');
  return (
    <svg className="sparkline" viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true">
      <polyline points={points} fill="none" strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function MetricCard({
  label,
  value,
  description,
  comparison,
  periodLabel,
  trend
}: {
  label: string;
  value: number;
  description: string;
  comparison?: MetricComparison | 'loading';
  periodLabel?: string;
  trend?: number[];
}) {
  const direction =
    comparison && comparison !== 'loading' && comparison.state === 'available'
      ? Math.sign(comparison.delta ?? 0)
      : 0;
  return (
    <article className="metric dashboard-card">
      <h2>{label}</h2>
      <strong>{formatNumber(value)}</strong>
      {comparison && (
        <p
          className={`metric-change ${direction > 0 ? 'up' : direction < 0 ? 'down' : ''}`}
          aria-live="polite"
        >
          {comparison === 'loading' ? (
            'Comparing to the previous period…'
          ) : (
            <>
              <span aria-hidden="true">{direction > 0 ? '▲ ' : direction < 0 ? '▼ ' : ''}</span>
              {describeChange(comparison)}
              {comparison.state === 'available' && comparison.previous !== undefined && (
                <span className="metric-previous">
                  {' '}
                  vs {formatNumber(comparison.previous)} in the {periodLabel ?? 'previous period'}
                </span>
              )}
            </>
          )}
        </p>
      )}
      {trend && <Sparkline values={trend} />}
      <small>{description}</small>
    </article>
  );
}
