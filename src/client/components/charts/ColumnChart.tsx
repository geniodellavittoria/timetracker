import { formatDuration } from '@shared/time.ts';

export interface Column {
  key: string;
  label: string;
  /** Minutes; null draws no bar (e.g. an untracked day). */
  valueMinutes: number | null;
  /** Minutes, drawn as a tick across the column. 0 draws none. */
  targetMinutes: number;
  color: string;
  /** Tooltip and screen-reader text for the column. */
  title: string;
}

/** Hour gridlines — at most four, on a round step. */
function ticks(maxMinutes: number): number[] {
  const hours = maxMinutes / 60;
  const step = [1, 2, 4, 5, 10, 20, 25, 50].find((s) => hours / s <= 4) ?? 100;
  const out: number[] = [];
  for (let h = step; h * 60 <= maxMinutes; h += step) out.push(h * 60);
  return out;
}

/**
 * Worked-vs-target columns. Plain HTML/CSS rather than SVG so the text stays
 * at its real size at every width.
 */
export function ColumnChart({ columns, label, legend }: { columns: Column[]; label: string; legend?: React.ReactNode }) {
  const peak = Math.max(60, ...columns.map((c) => Math.max(c.valueMinutes ?? 0, c.targetMinutes)));
  const max = peak * 1.1;
  const pct = (m: number) => `${(m / max) * 100}%`;

  return (
    <figure className="column-chart">
      <div className="column-plot" role="img" aria-label={`${label}: ${columns.map((c) => c.title).join('; ')}`}>
        {ticks(max).map((t) => (
          <span key={t} className="column-grid" style={{ bottom: pct(t) }}>
            <span className="column-grid-label">{t / 60} h</span>
          </span>
        ))}
        {columns.map((c) => (
          <div key={c.key} className="column" title={c.title}>
            {c.valueMinutes !== null && c.valueMinutes > 0 && (
              <span className="column-bar" style={{ height: pct(c.valueMinutes), background: c.color }} />
            )}
            {c.targetMinutes > 0 && <span className="column-target" style={{ bottom: pct(c.targetMinutes) }} />}
          </div>
        ))}
      </div>
      <div className="column-labels" aria-hidden="true">
        {columns.map((c) => <span key={c.key}>{c.label}</span>)}
      </div>
      {legend && <figcaption className="chart-legend">{legend}</figcaption>}
    </figure>
  );
}

export function columnTitle(label: string, worked: number | null, target: number): string {
  return `${label}: ${worked === null ? 'nicht erfasst' : formatDuration(worked)} von ${formatDuration(target)}`;
}

/** Legend entries shared by the week and month column charts. */
export function LegendItem({ fill, children, target = false }: { fill?: string; children: React.ReactNode; target?: boolean }) {
  return (
    <span className="legend-item">
      <span className={target ? 'legend-target' : 'legend-swatch'} style={fill ? { background: fill } : undefined} />
      {children}
    </span>
  );
}
