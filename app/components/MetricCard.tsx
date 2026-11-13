export type Tone =
  | "blue" | "green" | "purple" | "slate" | "cyan"
  | "emerald" | "red" | "indigo" | "amber";

export function MetricCard({
  label, value, tone, onClick, hint,
}: {
  label: string;
  value: string | number;
  tone: Tone;
  onClick?: () => void;
  hint?: string;
}) {
  const content = <>
    <span className="metric-label">{label}</span>
    <strong className="metric-value">{value}</strong>

  </>;
  if (onClick) return (
    <button type="button" title={hint||"عرض تفاصيل "+label}
      className={`metric-card tone-${tone} w-full text-start cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 hover:shadow-lg transition-shadow`}
      onClick={onClick}>
      {content}
    </button>
  );
  return <div className={`metric-card tone-${tone}`}>{content}</div>;
}
