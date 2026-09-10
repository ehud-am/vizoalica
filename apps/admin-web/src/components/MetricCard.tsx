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
      <span>{label}</span>
      <strong>{value.toLocaleString()}</strong>
      <small>{description}</small>
    </article>
  );
}
