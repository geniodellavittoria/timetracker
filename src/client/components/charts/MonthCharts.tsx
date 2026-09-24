import { runningBalance } from '@shared/calc.ts';
import { DAY_TYPES } from '@shared/types.ts';
import type { DayType, IsoDate, RangeSummary } from '@shared/types.ts';
import { dayTypeLabel } from '../DayTypeSelect.tsx';
import { BalanceLine } from './BalanceLine.tsx';
import { DAY_TYPE_COLOR } from './chartColors.ts';
import { ColumnChart, columnTitle, LegendItem } from './ColumnChart.tsx';
import { StackedBar } from './StackedBar.tsx';

/** Days per type in the range — replaces the old "Arbeit 12 · Ferien 3 · …" line. */
export function DayTypeBar({ counts }: { counts: Record<DayType, number> }) {
  return (
    <div className="day-type-bar">
      <StackedBar
        label="Erfasste Tage nach Typ"
        segments={DAY_TYPES.map((t) => ({ key: t, label: dayTypeLabel(t), value: counts[t], fill: DAY_TYPE_COLOR[t] }))}
      />
    </div>
  );
}

/**
 * Two panels, never one chart with two axes: worked vs. target per week, and
 * the running balance across the month.
 */
export function MonthCharts({ summary, today }: { summary: RangeSummary; today: IsoDate }) {
  const balances = runningBalance(summary.days, summary.cumulativeBalanceMinutes);
  // Future days add nothing, so the line stops at today.
  const points = summary.days
    .map((d, i) => ({ date: d.date, minutes: balances[i]! }))
    .filter((p) => p.date <= today);

  return (
    <div className="chart-grid">
      <div className="card chart-card">
        <h3 className="chart-title">Gearbeitet pro Woche</h3>
        <ColumnChart
          label="Gearbeitet pro Woche"
          columns={summary.buckets.map((b) => {
            const week = `KW ${Number(b.key.slice(6))}`;
            return {
              key: b.key,
              label: week,
              valueMinutes: b.totals.trackedDayCount > 0 ? b.totals.workedMinutes : null,
              targetMinutes: b.totals.targetMinutesScheduled,
              color: DAY_TYPE_COLOR.normal,
              title: columnTitle(week, b.totals.trackedDayCount > 0 ? b.totals.workedMinutes : null, b.totals.targetMinutesScheduled),
            };
          })}
          legend={
            <>
              <LegendItem fill={DAY_TYPE_COLOR.normal}>Gearbeitet</LegendItem>
              <LegendItem target>Ziel</LegendItem>
            </>
          }
        />
      </div>
      {points.length > 0 && (
        <div className="card chart-card">
          <h3 className="chart-title">Saldo-Verlauf</h3>
          <BalanceLine label="Saldo-Verlauf" points={points} />
        </div>
      )}
    </div>
  );
}
