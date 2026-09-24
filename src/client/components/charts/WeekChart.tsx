import { formatDayMonth, WEEKDAY_LABELS } from '@shared/dates.ts';
import { DAY_TYPES } from '@shared/types.ts';
import type { DaySummary } from '@shared/types.ts';
import { dayTypeLabel } from '../DayTypeSelect.tsx';
import { DAY_TYPE_COLOR } from './chartColors.ts';
import { ColumnChart, columnTitle, LegendItem } from './ColumnChart.tsx';

/** Worked time per day of the week against each day's target. */
export function WeekChart({ days }: { days: DaySummary[] }) {
  const typesShown = DAY_TYPES.filter((t) => days.some((d) => d.dayType === t));

  return (
    <div className="card chart-card">
      <h3 className="chart-title">Gearbeitet pro Tag</h3>
      <ColumnChart
        label="Gearbeitet pro Tag"
        columns={days.map((d) => {
          const name = `${WEEKDAY_LABELS[d.weekday]} ${formatDayMonth(d.date)}`;
          const special = d.dayType && d.dayType !== 'normal' ? ` (${dayTypeLabel(d.dayType)})` : '';
          return {
            key: d.date,
            label: WEEKDAY_LABELS[d.weekday]!,
            valueMinutes: d.hasEntry ? d.workedMinutes : null,
            targetMinutes: d.targetMinutes,
            color: DAY_TYPE_COLOR[d.dayType ?? 'normal'],
            title: columnTitle(name, d.hasEntry ? d.workedMinutes : null, d.targetMinutes) + special,
          };
        })}
        legend={
          <>
            {typesShown.map((t) => <LegendItem key={t} fill={DAY_TYPE_COLOR[t]}>{dayTypeLabel(t)}</LegendItem>)}
            <LegendItem target>Ziel</LegendItem>
          </>
        }
      />
    </div>
  );
}
