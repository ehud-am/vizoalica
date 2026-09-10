export function MetricCard({
  label,
  value,
  description
}: {
  label: string;
  value: number;
  description: string;
}) {
  return (
    <article className="metric dashboard-card">
      <h2>{label}</h2>
      <strong>{value.toLocaleString()}</strong>
      <small>{description}</small>
    </article>
  );
}
