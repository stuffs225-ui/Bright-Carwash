export type Tone =
  | "blue"
  | "green"
  | "purple"
  | "slate"
  | "cyan"
  | "emerald"
  | "red"
  | "indigo"
  | "amber";

export function MetricCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone: Tone;
}) {
  return (
    <div className={`metric-card tone-${tone}`}>
      <span className="metric-label">{label}</span>
      <strong className="metric-value">{value}</strong>
    </div>
  );
}
