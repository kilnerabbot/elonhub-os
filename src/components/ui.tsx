import type { ReactNode } from "react";

/* ---------- containers ---------- */

export function Card({
  title,
  action,
  children,
  className = "",
}: {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-2xl border border-border bg-surface p-5 ${className}`}
    >
      {(title || action) && (
        <header className="mb-4 flex items-center justify-between gap-3">
          {typeof title === "string" ? (
            <h2 className="text-[15px] font-semibold tracking-tight text-text">{title}</h2>
          ) : (
            title
          )}
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

export function Label({ children }: { children: ReactNode }) {
  return (
    <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-text-faint">
      {children}
    </div>
  );
}

/* ---------- delta pill ---------- */

export function DeltaPill({ value }: { value: number | null }) {
  if (value === null) {
    return (
      <span className="rounded-md bg-surface-2 px-1.5 py-0.5 text-[11px] font-medium text-text-faint">
        —
      </span>
    );
  }
  const up = value >= 0;
  return (
    <span
      className={`rounded-md px-1.5 py-0.5 text-[11px] font-medium tabular-nums ${
        up ? "bg-good-soft text-good" : "bg-danger-soft text-danger"
      }`}
    >
      {up ? "↑" : "↓"} {Math.abs(value).toFixed(1)}%
    </span>
  );
}

/* ---------- sparkline ----------
   Renders a smooth-ish polyline over an arbitrary series.
   All-zero or single-point series collapses to a flat mid-line, which is
   truthful for an empty database rather than inventing a shape. */

export function Sparkline({
  series,
  color = "var(--color-accent)",
  height = 90,
}: {
  series: number[];
  color?: string;
  height?: number;
}) {
  const pts = series.length >= 2 ? series : [0, 0];
  const max = Math.max(...pts);
  const min = Math.min(...pts);
  const span = max - min || 1;
  const flat = max === min;

  const coords = pts.map((v, i) => {
    const x = (i / (pts.length - 1)) * 100;
    const y = flat ? 50 : 100 - ((v - min) / span) * 84 - 8;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });

  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      style={{ height }}
      className="w-full"
      role="img"
      aria-label={flat ? "No variation in series" : "Trend line"}
    >
      {[20, 40, 60, 80].map((y) => (
        <line
          key={y}
          x1="0"
          x2="100"
          y1={y}
          y2={y}
          stroke="var(--color-border)"
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
          strokeDasharray="3 4"
        />
      ))}
      <polyline
        points={coords.join(" ")}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/* ---------- donut ---------- */

export function Donut({
  segments,
  centerValue,
  centerLabel,
}: {
  segments: { label: string; value: number; color: string }[];
  centerValue: string;
  centerLabel: string;
}) {
  const total = segments.reduce((a, s) => a + s.value, 0);
  const R = 40;
  const C = 2 * Math.PI * R;
  let offset = 0;

  return (
    <div className="relative mx-auto aspect-square w-[168px]">
      <svg viewBox="0 0 100 100" className="-rotate-90">
        <circle cx="50" cy="50" r={R} fill="none" stroke="var(--color-surface-2)" strokeWidth="12" />
        {total > 0 &&
          segments.map((s) => {
            const len = (s.value / total) * C;
            const el = (
              <circle
                key={s.label}
                cx="50"
                cy="50"
                r={R}
                fill="none"
                stroke={s.color}
                strokeWidth="12"
                strokeDasharray={`${len} ${C - len}`}
                strokeDashoffset={-offset}
                strokeLinecap="butt"
              />
            );
            offset += len;
            return el;
          })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="text-2xl font-semibold tracking-tight text-text">{centerValue}</div>
        <div className="text-xs text-text-dim">{centerLabel}</div>
      </div>
    </div>
  );
}

/* ---------- grouped bars ---------- */

export function GroupedBars({
  groups,
}: {
  groups: { label: string; a: number; b: number }[];
}) {
  const max = Math.max(1, ...groups.flatMap((g) => [g.a, g.b]));
  return (
    <div className="flex h-[150px] items-end gap-3">
      {groups.map((g) => (
        <div key={g.label} className="flex flex-1 flex-col items-center gap-2">
          <div className="flex h-[120px] w-full items-end justify-center gap-1">
            <div
              className="w-1/3 rounded-t bg-accent"
              style={{ height: `${Math.max(2, (g.a / max) * 100)}%` }}
            />
            <div
              className="w-1/3 rounded-t bg-violet"
              style={{ height: `${Math.max(2, (g.b / max) * 100)}%` }}
            />
          </div>
          <span className="text-[11px] text-text-faint">{g.label}</span>
        </div>
      ))}
    </div>
  );
}

export function LegendDot({ color, children }: { color: string; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] text-text-dim">
      <span className="size-2 rounded-full" style={{ background: color }} />
      {children}
    </span>
  );
}

/* ---------- empty overlay ---------- */

export function EmptyNote({ children }: { children: ReactNode }) {
  return (
    <p className="mt-3 rounded-lg bg-surface-2 px-3 py-2 text-[11px] text-text-faint">
      {children}
    </p>
  );
}
