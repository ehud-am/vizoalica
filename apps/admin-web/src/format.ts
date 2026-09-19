export const formatNumber = (value: number): string => value.toLocaleString();

/** Share of a total as a short percentage: "<0.1%", "4.2%", "38%". */
export function formatShare(count: number, total: number): string {
  if (total <= 0 || count <= 0) return '0%';
  const percent = (count / total) * 100;
  if (percent < 0.1) return '<0.1%';
  if (percent < 10) return `${percent.toFixed(1)}%`;
  return `${Math.round(percent)}%`;
}
