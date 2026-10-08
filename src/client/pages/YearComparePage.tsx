import { useState } from 'react';
import { todayIsoDateLocal } from '@shared/dates.ts';
import type { YearComparison } from '@shared/types.ts';
import { DurationText } from '../components/DurationText.tsx';
import { LegendItem } from '../components/charts/ColumnChart.tsx';
import { YearLines, type YearSeries } from '../components/charts/YearLines.tsx';
import { useYearComparison } from '../api/queries.ts';

/** The categorical palette has eight slots; older years than that stay in the table only. */
const MAX_CHART_YEARS = 8;

export function YearComparePage() {
  const today = todayIsoDateLocal();
  const { data, error } = useYearComparison(today);
  const [hidden, setHidden] = useState<ReadonlySet<number>>(new Set());

  const toggle = (year: number) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (!next.delete(year)) next.add(year);
      return next;
    });

  return (
    <section>
      <h2>Jahresvergleich</h2>

      {error && <p className="error-banner">Der Jahresvergleich konnte nicht geladen werden.</p>}
      {!data ? (
        !error && <p className="muted loading-note">Lädt…</p>
      ) : data.years.length === 0 ? (
        <p className="muted">Noch keine Einträge erfasst.</p>
      ) : (
        <YearCompareContent years={data.years} hidden={hidden} onToggle={toggle} />
      )}
    </section>
  );
}

function YearCompareContent({ years, hidden, onToggle }: {
  years: YearComparison[];
  hidden: ReadonlySet<number>;
  onToggle: (year: number) => void;
}) {
  // Colour follows the year, counted from the oldest charted one, so adding a
  // new year never repaints the existing lines.
  const charted = years.slice(-MAX_CHART_YEARS);
  const series: YearSeries[] = charted.map((y, i) => ({
    year: y.year,
    color: `var(--chart-series-${i + 1})`,
    weeks: y.weeks,
  }));
  const visible = series.filter((s) => !hidden.has(s.year));
  const latest = charted[charted.length - 1]!;

  return (
    <>
      <div className="card chart-card">
        <h3 className="chart-title">Gearbeitete Stunden pro Kalenderwoche</h3>
        <div className="chart-legend year-legend" role="group" aria-label="Jahre ein- oder ausblenden">
          {series.map((s) => (
            <button
              key={s.year}
              type="button"
              className={`ghost small year-toggle ${hidden.has(s.year) ? 'is-off' : ''}`}
              aria-pressed={!hidden.has(s.year)}
              onClick={() => onToggle(s.year)}
            >
              <LegendItem fill={s.color}>{s.year}</LegendItem>
            </button>
          ))}
          <span className="year-legend-target">
            <span className="legend-target year-legend-dash" />
            Soll {latest.year}
          </span>
        </div>
        <YearLines
          series={visible}
          target={latest.weeks}
          label={`Gearbeitete Stunden pro Kalenderwoche, ${visible.map((s) => s.year).join(', ') || 'kein Jahr gewählt'}`}
        />
        <p className="faint small year-note">Ferien, Feiertage und Krankheit zählen hier nicht als gearbeitet – zusätzlich erfasste Zeit an diesen Tagen schon.</p>
      </div>

      <div className="card chart-card year-table-card">
        <h3 className="chart-title">Jahressummen</h3>
        <div className="year-table-scroll">
          <table className="year-table">
            <thead>
              <tr>
                <th scope="col">Jahr</th>
                <th scope="col">Gearbeitet</th>
                <th scope="col">Ø pro Woche</th>
                <th scope="col">Wochen</th>
                <th scope="col">Abwesend</th>
                <th scope="col">Saldo</th>
              </tr>
            </thead>
            <tbody>
              {[...years].reverse().map((y) => (
                <tr key={y.year}>
                  <th scope="row">{y.year}</th>
                  <td><DurationText minutes={y.totals.workedMinutes} /></td>
                  <td>
                    <DurationText
                      minutes={y.totals.workedWeekCount ? Math.round(y.totals.workedMinutes / y.totals.workedWeekCount) : null}
                    />
                  </td>
                  <td className="num">{y.totals.workedWeekCount}</td>
                  <td className="num">{y.totals.absenceDays} Tage</td>
                  <td><DurationText minutes={y.totals.balanceMinutes} signed colored /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="faint small year-note">Ø pro Woche über die Wochen mit gearbeiteter Zeit.</p>
      </div>
    </>
  );
}
