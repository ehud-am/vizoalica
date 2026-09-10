import type { RankedResult } from '../api/local-operations.js';

export function RankedTable({ title, result }: { title: string; result: RankedResult }) {
  return (
    <section
      className="dashboard-card ranked-card"
      aria-labelledby={`${title.replaceAll(' ', '-')}-title`}
    >
      <h2 id={`${title.replaceAll(' ', '-')}-title`}>{title}</h2>
      {result.total === 0 ? (
        <p className="chart-empty">No data in this range.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th scope="col">Rank</th>
              <th scope="col">Value</th>
              <th scope="col">Views</th>
            </tr>
          </thead>
          <tbody>
            {result.items.map((item, index) => (
              <tr key={item.label}>
                <td>{index + 1}</td>
                <th scope="row">{item.label}</th>
                <td>{item.count.toLocaleString()}</td>
              </tr>
            ))}
            {result.otherCount > 0 && (
              <tr>
                <td>—</td>
                <th scope="row">Other</th>
                <td>{result.otherCount.toLocaleString()}</td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </section>
  );
}
