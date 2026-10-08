import { useState } from 'react';
import type { YearWeekPoint } from '@shared/types.ts';
import { DurationText } from '../DurationText.tsx';

const W = 530;
const H = 100;
const WEEKS = 53;
const X_TICKS = [1, 10, 20, 30, 40, 50];

export interface YearSeries {
  year: number;
  color: string;
  weeks: YearWeekPoint[];
}

/**
 * Worked hours per ISO week, one line per year, so the same week lines up
 * across years. Same construction as BalanceLine: the SVG stretches, strokes
 * don't scale, and every label, dot and the tooltip are HTML on top. Weeks
 * without worked time are gaps, not zeros.
 */
export function YearLines({ series, target, label }: {
  series: YearSeries[];
  /** Weekly target drawn as a dashed reference line (latest year's). */
  target: YearWeekPoint[] | null;
  label: string;
}) {
  const [active, setActive] = useState<number | null>(null);

  const values = series.flatMap((s) => s.weeks.map((w) => w.workedMinutes ?? 0))
    .concat(target?.map((w) => w.targetMinutes) ?? []);
  // Round the top up to whole 10 hours so the gridlines land on even numbers.
  const top = Math.max(600, Math.ceil(Math.max(0, ...values) / 600) * 600);
  const x = (week: number) => ((week - 0.5) / WEEKS) * W;
  const y = (minutes: number) => H - (H * minutes) / top;
  const pct = (week: number) => `${(x(week) / W) * 100}%`;

  const moveTo = (week: number) => setActive(Math.min(WEEKS, Math.max(1, week)));

  return (
    <figure className="year-lines">
      <div className="year-lines-frame">
        {[top, top / 2].map((m) => (
          <span key={m} className="year-lines-grid-label" style={{ top: `${(y(m) / H) * 100}%` }}>
            {m / 60} h
          </span>
        ))}
        <div className="year-lines-area">
          <div
            className="year-lines-plot"
            role="img"
            tabIndex={0}
            aria-label={`${label}. Pfeiltasten wählen eine Kalenderwoche.`}
            onPointerMove={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              moveTo(Math.floor(((e.clientX - rect.left) / rect.width) * WEEKS) + 1);
            }}
            onPointerLeave={() => setActive(null)}
            onBlur={() => setActive(null)}
            onKeyDown={(e) => {
              const step = { ArrowLeft: -1, ArrowRight: 1 }[e.key];
              if (step === undefined) return;
              e.preventDefault();
              moveTo((active ?? 1) + step);
            }}
          >
            <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
              {[top, top / 2].map((m) => (
                <line key={m} x1={0} x2={W} y1={y(m)} y2={y(m)} className="year-lines-grid" vectorEffect="non-scaling-stroke" />
              ))}
              {target && (
                <path
                  d={pathFor(target.map((w) => ({ week: w.week, minutes: w.targetMinutes })), x, y)}
                  className="year-lines-target"
                  vectorEffect="non-scaling-stroke"
                />
              )}
              {series.map((s) => (
                <path
                  key={s.year}
                  d={pathFor(s.weeks.map((w) => ({ week: w.week, minutes: w.workedMinutes })), x, y)}
                  className="year-lines-path"
                  style={{ stroke: s.color }}
                  vectorEffect="non-scaling-stroke"
                />
              ))}
            </svg>

            {active !== null && (
              <>
                <span className="year-lines-crosshair" style={{ left: pct(active) }} />
                {series.map((s) => {
                  const minutes = s.weeks[active - 1]?.workedMinutes;
                  if (minutes == null) return null;
                  return (
                    <span
                      key={s.year}
                      className="year-lines-dot"
                      style={{ left: pct(active), top: `${(y(minutes) / H) * 100}%`, background: s.color }}
                    />
                  );
                })}
              </>
            )}
          </div>

          {active !== null && (
            <div
              className={`year-lines-tooltip small ${active > WEEKS / 2 ? 'is-left' : ''}`}
              style={{ left: pct(active) }}
              role="status"
            >
              <strong>KW {active}</strong>
              {[...series].reverse().map((s) => {
                const point = s.weeks[active - 1];
                return (
                  <span key={s.year} className="year-lines-tooltip-row">
                    <span className="legend-swatch" style={{ background: s.color }} />
                    <span>{s.year}</span>
                    {point ? <DurationText minutes={point.workedMinutes} /> : <span className="faint">keine KW {active}</span>}
                    {point && point.absenceDays > 0 && (
                      <span className="muted">
                        ({point.absenceDays} {point.absenceDays === 1 ? 'Abwesenheitstag' : 'Abwesenheitstage'})
                      </span>
                    )}
                  </span>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="year-lines-x small">
        {X_TICKS.map((week) => (
          <span key={week} style={{ left: pct(week) }}>KW {week}</span>
        ))}
      </div>
    </figure>
  );
}

/** One `M…L…` run per stretch of consecutive weeks with a value; a lone week gets a short tick so it stays visible. */
function pathFor(
  points: { week: number; minutes: number | null }[],
  x: (week: number) => number,
  y: (minutes: number) => number,
): string {
  const parts: string[] = [];
  let run: { week: number; minutes: number }[] = [];
  const flush = () => {
    if (run.length === 1) {
      const p = run[0]!;
      parts.push(`M${(x(p.week) - 3).toFixed(1)},${y(p.minutes).toFixed(1)} L${(x(p.week) + 3).toFixed(1)},${y(p.minutes).toFixed(1)}`);
    } else if (run.length > 1) {
      parts.push(run.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.week).toFixed(1)},${y(p.minutes).toFixed(1)}`).join(' '));
    }
    run = [];
  };
  for (const p of points) {
    if (p.minutes === null) flush();
    else run.push({ week: p.week, minutes: p.minutes });
  }
  flush();
  return parts.join(' ');
}
