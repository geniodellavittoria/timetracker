import { formatDayMonth } from '@shared/dates.ts';
import { formatDuration } from '@shared/time.ts';
import type { IsoDate } from '@shared/types.ts';

const W = 300;
const H = 100;

/**
 * Running balance as a line over a zero baseline. The SVG stretches to fit,
 * and non-scaling strokes keep the line at 2px. Labels are HTML on top, so
 * they never stretch with it.
 */
export function BalanceLine({ points, label }: { points: { date: IsoDate; minutes: number }[]; label: string }) {
  if (points.length === 0) return null;

  const values = points.map((p) => p.minutes);
  const lo = Math.min(0, ...values);
  const hi = Math.max(0, ...values);
  const span = hi - lo || 60;
  // 10% headroom top and bottom so the end dot clears the edges.
  const y = (m: number) => H * 0.1 + (H * 0.8 * (hi - m)) / span;
  const x = (i: number) => (points.length === 1 ? W / 2 : (i / (points.length - 1)) * W);
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.minutes).toFixed(1)}`).join(' ');
  const slot = W / points.length;

  const first = points[0]!;
  const last = points[points.length - 1]!;
  const signed = (m: number) => formatDuration(m, { signed: true });

  return (
    <figure className="balance-line">
      <div
        className="balance-plot"
        role="img"
        aria-label={`${label}: von ${signed(first.minutes)} am ${formatDayMonth(first.date)} auf ${signed(last.minutes)} am ${formatDayMonth(last.date)}`}
      >
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
          <line x1={0} x2={W} y1={y(0)} y2={y(0)} className="balance-zero" vectorEffect="non-scaling-stroke" />
          <path d={path} className="balance-path" vectorEffect="non-scaling-stroke" />
          {points.map((p, i) => (
            <rect key={p.date} x={x(i) - slot / 2} y={0} width={slot} height={H} className="balance-hit">
              <title>{`${formatDayMonth(p.date)}: ${signed(p.minutes)}`}</title>
            </rect>
          ))}
        </svg>
        <span
          className="balance-dot"
          style={{ left: `${(x(points.length - 1) / W) * 100}%`, top: `${(y(last.minutes) / H) * 100}%` }}
        />
      </div>
      <div className="balance-labels small">
        <span className="muted">{formatDayMonth(first.date)} <span className="num">{signed(first.minutes)}</span></span>
        <span>{formatDayMonth(last.date)} <strong className="num">{signed(last.minutes)}</strong></span>
      </div>
    </figure>
  );
}
