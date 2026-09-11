import { Cell, Pie, PieChart, ResponsiveContainer } from 'recharts';
import type { DistributionResult } from '../api/local-operations.js';

const COLORS = [
  'var(--color-chart-1)',
  'var(--color-chart-2)',
  'var(--color-chart-3)',
  'var(--color-chart-4)',
  'var(--color-chart-5)',
  'var(--color-chart-6)',
  'var(--color-chart-7)',
  'var(--color-chart-8)'
];

export function DistributionChart({
  title,
  result
}: {
  title: string;
  result: DistributionResult;
}) {
  return (
    <figure className="dashboard-card distribution-card">
      <figcaption>
        <h2>{title}</h2>
      </figcaption>
      {result.total === 0 ? (
        <p className="chart-empty">No data in this range.</p>
      ) : (
        <div className="distribution-layout">
          <div className="pie-canvas" aria-hidden="true">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart accessibilityLayer={false}>
                <Pie
                  data={result.items}
                  dataKey="count"
                  nameKey="label"
                  innerRadius="48%"
                  outerRadius="78%"
                  isAnimationActive={false}
                  rootTabIndex={-1}
                >
                  {result.items.map((item, index) => (
                    <Cell key={item.label} fill={COLORS[index % COLORS.length]!} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          </div>
          <ul className="distribution-list">
            {result.items.map((item, index) => (
              <li key={item.label}>
                <span
                  className="legend-swatch"
                  style={{ backgroundColor: COLORS[index % COLORS.length] }}
                  aria-hidden="true"
                />
                <span>{item.label}</span>
                <strong>
                  {Math.round((item.count / result.total) * 100)}% · {item.count.toLocaleString()}
                </strong>
              </li>
            ))}
          </ul>
        </div>
      )}
    </figure>
  );
}
