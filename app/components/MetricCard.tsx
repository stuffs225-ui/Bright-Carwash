export function MetricCard({
  label,
  value,
  bg,
  color,
}: {
  label: string;
  value: string | number;
  bg: string;
  color: string;
}) {
  return (
    <div className={`metric-card ${bg}`}>
      <span className="metric-label">{label}</span>
      <strong className={`metric-value ${color}`}>{value}</strong>
    </div>
  );
}
