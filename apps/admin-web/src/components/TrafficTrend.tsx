import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import type { AnalyticsOverview } from '../api/local-operations.js';

export function TrafficTrend({ points }: { points: AnalyticsOverview['trend'] }) {
  const data = points.map((point) => ({
    ...point,
    label: new Date(point.startUtc).toLocaleString([], {
      month: 'short',
      day: 'numeric',
      hour: 'numeric'
    })
  }));
  return (
    <figure className="dashboard-card trend-card">
      <figcaption>
        <h2>Traffic over time</h2>
        <p>Page views and distinct users within each interval.</p>
      </figcaption>
      {data.length === 0 ? (
        <p className="chart-empty">No traffic in this range.</p>
      ) : (
        <>
          <div className="chart-canvas" aria-hidden="true">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} accessibilityLayer>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="pageViews"
                  name="Page views"
                  stroke="#215c42"
                  strokeWidth={3}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="uniqueUsers"
                  name="Unique users"
                  stroke="#b56a22"
                  strokeWidth={2}
                  strokeDasharray="6 4"
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <table className="chart-data">
            <caption>Exact traffic values</caption>
            <thead>
              <tr>
                <th scope="col">Interval</th>
                <th scope="col">Page views</th>
                <th scope="col">Unique users</th>
              </tr>
            </thead>
            <tbody>
              {data.map((point) => (
                <tr key={point.startUtc}>
                  <th scope="row">{point.label}</th>
                  <td>{point.pageViews}</td>
                  <td>{point.uniqueUsers}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </figure>
  );
}
