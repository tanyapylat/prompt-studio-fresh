/**
 * Small, dependency-free SVG charts for the N-way comparison view (`ComparisonRunBody`) — no
 * charting library in this project yet, and these are simple enough (bars, dots) that pulling one
 * in for just this isn't worth it. Not meant to be a general-purpose chart kit — just what
 * promptfoo's own comparison view shows: a pass-rate bar per variant, a per-metric grouped bar, and
 * a 2-way scatter plot.
 */

const VARIANT_COLORS = ["#6366f1", "#f97316", "#10b981", "#ec4899", "#0ea5e9", "#a855f7"];

export function variantColor(index: number): string {
  return VARIANT_COLORS[index % VARIANT_COLORS.length];
}

/** One bar per variant — e.g. overall pass rate. */
export function PassRateBarChart({ labels, values }: { labels: string[]; values: number[] }) {
  const width = 560;
  const barHeight = 22;
  const gap = 10;
  const labelWidth = 160;
  const chartWidth = width - labelWidth - 50;
  const height = values.length * (barHeight + gap);

  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Pass rate by variant">
      {values.map((v, i) => {
        const y = i * (barHeight + gap);
        const barW = Math.max(2, chartWidth * Math.min(1, Math.max(0, v)));
        return (
          <g key={i}>
            <text x={0} y={y + barHeight / 2 + 4} className="fill-slate-600" fontSize={11}>
              {labels[i].length > 26 ? `${labels[i].slice(0, 25)}…` : labels[i]}
            </text>
            <rect x={labelWidth} y={y} width={chartWidth} height={barHeight} rx={4} className="fill-slate-100" />
            <rect x={labelWidth} y={y} width={barW} height={barHeight} rx={4} fill={variantColor(i)} />
            <text x={labelWidth + chartWidth + 8} y={y + barHeight / 2 + 4} className="fill-slate-700 font-medium" fontSize={11}>
              {Math.round(v * 100)}%
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** One group of bars (one per variant) per metric — the per-assertion breakdown, side by side across variants. */
export function GroupedBarChart({
  groupLabels,
  seriesLabels,
  values,
}: {
  /** x-axis categories, e.g. assertion names. */
  groupLabels: string[];
  /** One legend entry / bar-color per variant. */
  seriesLabels: string[];
  /** `values[groupIndex][seriesIndex]` — pass rate 0..1. */
  values: number[][];
}) {
  const chartHeight = 180;
  const groupGap = 24;
  const barGap = 3;
  const barWidth = 16;
  const seriesCount = seriesLabels.length;
  const groupWidth = seriesCount * barWidth + (seriesCount - 1) * barGap;
  const width = Math.max(400, groupLabels.length * (groupWidth + groupGap));

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-3">
        {seriesLabels.map((label, i) => (
          <span key={i} className="flex items-center gap-1.5 text-[11px] text-slate-600">
            <span className="size-2.5 rounded-full" style={{ background: variantColor(i) }} />
            {label}
          </span>
        ))}
      </div>
      <div className="overflow-x-auto">
        <svg width={width} height={chartHeight + 40} viewBox={`0 0 ${width} ${chartHeight + 40}`} role="img" aria-label="Pass rate by metric">
          {/* baseline */}
          <line x1={0} y1={chartHeight} x2={width} y2={chartHeight} stroke="#e2e8f0" />
          {groupLabels.map((label, gi) => {
            const groupX = gi * (groupWidth + groupGap) + groupGap / 2;
            return (
              <g key={gi}>
                {values[gi]?.map((v, si) => {
                  const barH = Math.max(1, chartHeight * Math.min(1, Math.max(0, v)));
                  const x = groupX + si * (barWidth + barGap);
                  return <rect key={si} x={x} y={chartHeight - barH} width={barWidth} height={barH} rx={2} fill={variantColor(si)} />;
                })}
                <text
                  x={groupX + groupWidth / 2}
                  y={chartHeight + 16}
                  textAnchor="middle"
                  fontSize={9.5}
                  className="fill-slate-500"
                >
                  {label.length > 14 ? `${label.slice(0, 13)}…` : label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

/** 2-way agreement scatter — each dot is one row, x/y are the two variants' per-row pass fraction. Jittered slightly so ties (very common with 0/0.5/1 scores) don't all stack into one dot. */
export function ScatterChart({
  xLabel,
  yLabel,
  points,
}: {
  xLabel: string;
  yLabel: string;
  points: { x: number; y: number; agree: boolean; title: string }[];
}) {
  const size = 320;
  const pad = 36;
  const plot = size - pad * 2;

  function jitter(seed: number) {
    // Deterministic, cheap pseudo-jitter — not `Math.random` so re-renders don't shuffle dots.
    const f = Math.sin(seed * 12.9898) * 43758.5453;
    return (f - Math.floor(f) - 0.5) * 6;
  }

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${xLabel} vs ${yLabel} agreement scatter`}>
      <line x1={pad} y1={size - pad} x2={size - pad} y2={size - pad} stroke="#cbd5e1" />
      <line x1={pad} y1={pad} x2={pad} y2={size - pad} stroke="#cbd5e1" />
      <line
        x1={pad}
        y1={size - pad}
        x2={size - pad}
        y2={pad}
        stroke="#e2e8f0"
        strokeDasharray="3 3"
      />
      <text x={size / 2} y={size - 6} textAnchor="middle" fontSize={10} className="fill-slate-500">
        {xLabel}
      </text>
      <text x={12} y={size / 2} textAnchor="middle" fontSize={10} className="fill-slate-500" transform={`rotate(-90 12 ${size / 2})`}>
        {yLabel}
      </text>
      {points.map((p, i) => {
        const cx = pad + p.x * plot + jitter(i);
        const cy = size - pad - p.y * plot + jitter(i + 0.5);
        return (
          <circle
            key={i}
            cx={Math.min(size - pad, Math.max(pad, cx))}
            cy={Math.min(size - pad, Math.max(pad, cy))}
            r={4}
            fill={p.agree ? "#94a3b8" : "#e11d48"}
            opacity={0.75}
          >
            <title>{p.title}</title>
          </circle>
        );
      })}
    </svg>
  );
}
