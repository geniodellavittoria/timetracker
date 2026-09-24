import type { VacationSummary } from '@shared/types.ts';
import { stripes } from './charts/chartColors.ts';
import { StackedBar } from './charts/StackedBar.tsx';

const VACATION = 'var(--chart-vacation)';

/** 12.5 -> '12.5', 12 -> '12'. */
export const formatDays = (days: number) => days.toLocaleString('de-CH', { maximumFractionDigits: 1 });

/** Taken / planned / remaining Ferien days as one bar against the year's allowance. */
export function VacationBar({ summary, compact = false }: { summary: VacationSummary; compact?: boolean }) {
  const { takenDays, plannedDays, remainingDays, availableDays } = summary;
  return (
    <StackedBar
      compact={compact}
      label="Ferientage"
      total={availableDays}
      segments={[
        { key: 'taken', label: 'bezogen', value: takenDays, fill: VACATION, valueText: formatDays(takenDays) },
        { key: 'planned', label: 'geplant', value: plannedDays, fill: stripes(VACATION), valueText: formatDays(plannedDays) },
      ]}
      extraLegend={
        remainingDays >= 0 ? (
          <li>
            <span className="legend-swatch legend-empty" />
            verbleibend <strong className="num">{formatDays(remainingDays)}</strong>
          </li>
        ) : (
          <li className="legend-overbooked">
            ⚠ überbucht <strong className="num">{formatDays(-remainingDays)}</strong>
          </li>
        )
      }
    />
  );
}
