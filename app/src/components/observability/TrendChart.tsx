import { useId, useRef, useState } from "react";

export interface TrendPoint {
  /** Timestamp, ms. Points are placed on a real time axis. */
  t: number;
  value: number;
  /** Optional uncertainty band around `value`, same unit as `value`. */
  low?: number;
  high?: number;
  /** Draw this point as a regression marker. */
  flagged?: boolean;
}

export interface TrendSeries {
  id: string;
  label: string;
  color: string;
  points: TrendPoint[];
}

interface TrendChartProps {
  series: TrendSeries[];
  /** Format a y value for axis ticks and the hover readout. */
  format: (value: number) => string;
  yMin?: number;
  yMax?: number;
  /** Horizontal reference line (e.g. the alert threshold). */
  threshold?: number;
  thresholdLabel?: string;
  height?: number;
  ariaLabel: string;
  /** Show the 95% band where points have one. */
  showBand?: boolean;
  selected?: { seriesId: string; index: number } | null;
  onSelect?: (seriesId: string, index: number) => void;
  /** Drag across the chart to zoom into a time window. */
  onBrush?: (fromMs: number, toMs: number) => void;
  /** Label ticks with the time of day (use when the range is only a day or two). */
  showTime?: boolean;
}

const WIDTH = 720;
const PAD = { top: 22, right: 20, bottom: 26, left: 44 };
const DAY_MS = 86_400_000;

const fmtDay = (t: number) => new Date(t).toLocaleString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const fmtDayTime = (t: number) =>
  new Date(t).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" });

/**
 * Dependency-free SVG line chart on a real time axis: one or several series, optional confidence band,
 * hover readout, click to select, drag to zoom. See `results/charts.tsx` for the house style.
 */
export function TrendChart({
  series: seriesIn,
  format,
  yMin,
  yMax,
  threshold,
  thresholdLabel,
  height = 200,
  ariaLabel,
  showBand = true,
  selected,
  onSelect,
  onBrush,
  showTime = false,
}: TrendChartProps) {
  const gradientBase = useId();
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoverT, setHoverT] = useState<number | null>(null);
  const [drag, setDrag] = useState<{ from: number; to: number } | null>(null);

  // A config with nothing to plot in this period simply does not appear.
  const series = seriesIn.filter((s) => s.points.length > 0);
  const all = series.flatMap((s) => s.points);
  if (all.length === 0) return null;

  const tMin = Math.min(...all.map((p) => p.t));
  const tMax = Math.max(...all.map((p) => p.t));
  const span = Math.max(1, tMax - tMin);

  const lows = all.map((p) => p.low ?? p.value);
  const highs = all.map((p) => p.high ?? p.value);
  const dataMin = Math.min(...lows, threshold ?? Infinity);
  const dataMax = Math.max(...highs, threshold ?? -Infinity);
  const pad = (dataMax - dataMin || 1) * 0.12;
  const lo = yMin ?? dataMin - pad;
  const hi = yMax ?? dataMax + pad;

  const innerW = WIDTH - PAD.left - PAD.right;
  const innerH = height - PAD.top - PAD.bottom;
  const x = (t: number) => PAD.left + (all.length === 1 || tMax === tMin ? innerW / 2 : ((t - tMin) / span) * innerW);
  const y = (v: number) => PAD.top + (1 - (Math.min(hi, Math.max(lo, v)) - lo) / (hi - lo || 1)) * innerH;
  const tAt = (px: number) => tMin + ((px - PAD.left) / innerW) * span;

  const yTicks = [lo, lo + (hi - lo) / 2, hi];

  // X ticks at midnight UTC (or evenly spaced hours when zoomed in), at most ~7.
  const spanDays = span / DAY_MS;
  const xTicks: number[] = [];
  if (spanDays > 2.5) {
    const step = Math.max(1, Math.ceil(spanDays / 7));
    for (let t = Math.ceil(tMin / DAY_MS) * DAY_MS; t <= tMax; t += step * DAY_MS) xTicks.push(t);
  } else {
    const count = 5;
    for (let i = 0; i < count; i++) xTicks.push(tMin + (span * i) / (count - 1));
  }

  const dense = Math.max(...series.map((s) => s.points.length)) > 40;

  const toSvgX = (clientX: number) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return PAD.left;
    return ((clientX - rect.left) / rect.width) * WIDTH;
  };

  const nearestIndex = (s: TrendSeries, t: number) => {
    let best = 0;
    for (let i = 1; i < s.points.length; i++) if (Math.abs(s.points[i].t - t) < Math.abs(s.points[best].t - t)) best = i;
    return best;
  };

  const handleMove = (clientX: number) => {
    const px = Math.min(WIDTH - PAD.right, Math.max(PAD.left, toSvgX(clientX)));
    setHoverT(tAt(px));
    if (drag) setDrag({ ...drag, to: px });
  };

  const finishDrag = () => {
    if (!drag) return;
    const a = Math.min(drag.from, drag.to);
    const b = Math.max(drag.from, drag.to);
    setDrag(null);
    if (b - a >= 8 && onBrush) {
      onBrush(Math.round(tAt(a)), Math.round(tAt(b)));
    } else if (onSelect && hoverT != null) {
      // A click: pick the nearest point of the nearest series.
      let pick: { id: string; i: number; d: number } | null = null;
      for (const s of series) {
        const i = nearestIndex(s, hoverT);
        const d = Math.abs(s.points[i].t - hoverT);
        if (!pick || d < pick.d) pick = { id: s.id, i, d };
      }
      if (pick) onSelect(pick.id, pick.i);
    }
  };

  const hoverPoints = hoverT == null ? [] : series.map((s) => ({ s, p: s.points[nearestIndex(s, hoverT)] }));
  const readout =
    hoverPoints.length > 0
      ? `${showTime || spanDays <= 2.5 ? fmtDayTime(hoverPoints[0].p.t) : fmtDay(hoverPoints[0].p.t)}   ` +
        hoverPoints.map(({ s, p }) => `${series.length > 1 ? `${s.label} ` : ""}${format(p.value)}`).join("   ")
      : series.length > 1
        ? ""
        : "";

  return (
    <div>
      {series.length > 1 && (
        <div className="mb-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
          {series.map((s) => (
            <span key={s.id} className="flex items-center gap-1.5">
              <span className="inline-block h-0.5 w-4 rounded" style={{ background: s.color }} />
              {s.label}
            </span>
          ))}
        </div>
      )}
      <svg
        ref={svgRef}
        width="100%"
        viewBox={`0 0 ${WIDTH} ${height}`}
        role="img"
        aria-label={ariaLabel}
        className="select-none touch-none"
        onPointerLeave={() => {
          setHoverT(null);
          setDrag(null);
        }}
      >
        <defs>
          {series.map((s, i) => (
            <linearGradient key={s.id} id={`${gradientBase}-${i}`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={s.color} stopOpacity={series.length > 1 ? 0.12 : 0.18} />
              <stop offset="100%" stopColor={s.color} stopOpacity={0.04} />
            </linearGradient>
          ))}
        </defs>

        {yTicks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={WIDTH - PAD.right} y1={y(t)} y2={y(t)} className="stroke-slate-100" />
            <text x={PAD.left - 6} y={y(t) + 3} textAnchor="end" fontSize={10} className="fill-slate-400">
              {format(t)}
            </text>
          </g>
        ))}
        {xTicks.map((t) => (
          <text key={t} x={x(t)} y={height - 8} textAnchor="middle" fontSize={10} className="fill-slate-400">
            {spanDays > 2.5 ? fmtDay(t) : fmtDayTime(t)}
          </text>
        ))}

        {threshold != null && (
          <g>
            <line x1={PAD.left} x2={WIDTH - PAD.right} y1={y(threshold)} y2={y(threshold)} stroke="#dc2626" strokeDasharray="4 4" strokeOpacity={0.7} />
            <text x={WIDTH - PAD.right} y={y(threshold) - 4} textAnchor="end" fontSize={10} fill="#dc2626">
              {thresholdLabel ?? `Threshold ${format(threshold)}`}
            </text>
          </g>
        )}

        {series.map((s, si) => {
          const hasBand = showBand && s.points.every((p) => p.low != null && p.high != null);
          const band = hasBand
            ? `${s.points.map((p, i) => `${i === 0 ? "M" : "L"}${x(p.t)},${y(p.high!)}`).join(" ")} ` +
              `${[...s.points].reverse().map((p) => `L${x(p.t)},${y(p.low!)}`).join(" ")} Z`
            : null;
          const line = s.points.map((p, i) => `${i === 0 ? "M" : "L"}${x(p.t)},${y(p.value)}`).join(" ");
          return (
            <g key={s.id}>
              {band && <path d={band} fill={`url(#${gradientBase}-${si})`} />}
              <path d={line} fill="none" stroke={s.color} strokeWidth={dense ? 1.5 : 2} strokeLinejoin="round" />
              {s.points.map((p, i) => {
                const isSelected = selected?.seriesId === s.id && selected.index === i;
                if (dense && !p.flagged && !isSelected) return null;
                return (
                  <circle
                    key={i}
                    cx={x(p.t)}
                    cy={y(p.value)}
                    r={isSelected ? 5.5 : dense ? 3 : 4}
                    fill={p.flagged ? "#dc2626" : "#fff"}
                    stroke={p.flagged ? "#dc2626" : s.color}
                    strokeWidth={2}
                  />
                );
              })}
            </g>
          );
        })}

        {/* hover guide + highlighted points */}
        {hoverPoints.length > 0 && !drag && (
          <g pointerEvents="none">
            <line x1={x(hoverPoints[0].p.t)} x2={x(hoverPoints[0].p.t)} y1={PAD.top} y2={PAD.top + innerH} className="stroke-slate-300" strokeDasharray="2 3" />
            {hoverPoints.map(({ s, p }) => (
              <circle key={s.id} cx={x(p.t)} cy={y(p.value)} r={4} fill={s.color} stroke="#fff" strokeWidth={1.5} />
            ))}
          </g>
        )}

        {drag && (
          <rect
            x={Math.min(drag.from, drag.to)}
            y={PAD.top}
            width={Math.abs(drag.to - drag.from)}
            height={innerH}
            fill="#6366f1"
            fillOpacity={0.12}
            stroke="#6366f1"
            strokeOpacity={0.4}
            pointerEvents="none"
          />
        )}

        <text x={PAD.left} y={12} fontSize={hoverPoints.length > 0 ? 11 : 9} className={hoverPoints.length > 0 ? "fill-slate-700 font-medium" : "fill-slate-400"} pointerEvents="none">
          {readout || (onBrush ? "Hover for values · click to select a run · drag to zoom" : "Hover for values")}
        </text>

        {/* interaction surface */}
        <rect
          x={PAD.left}
          y={PAD.top}
          width={innerW}
          height={innerH}
          fill="transparent"
          className={onBrush ? "cursor-crosshair" : "cursor-pointer"}
          onPointerDown={(e) => {
            (e.target as Element).setPointerCapture?.(e.pointerId);
            const px = Math.min(WIDTH - PAD.right, Math.max(PAD.left, toSvgX(e.clientX)));
            setHoverT(tAt(px));
            setDrag({ from: px, to: px });
          }}
          onPointerMove={(e) => handleMove(e.clientX)}
          onPointerUp={finishDrag}
        />
      </svg>
    </div>
  );
}
