export interface DonutProps {
  percent: number;
  size?: number;
  label?: string;
}

export function Donut({ percent, size = 56, label }: DonutProps) {
  const clamped = Math.max(0, Math.min(100, percent));
  const radius = size / 2 - 4;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - clamped / 100);
  const color =
    clamped >= 90
      ? "var(--p-color-text-success)"
      : clamped >= 50
        ? "var(--p-color-text-caution)"
        : "var(--p-color-text-critical)";
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      aria-label={label}
      role="img"
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="var(--p-color-border-subdued)"
        strokeWidth="4"
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth="4"
        strokeDasharray={circumference}
        strokeDashoffset={dashOffset}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text
        x="50%"
        y="50%"
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={size / 4}
        fill="var(--p-color-text)"
      >
        {Math.round(clamped)}%
      </text>
    </svg>
  );
}
