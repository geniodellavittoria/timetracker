import { formatDayMonth } from '@shared/dates.ts';
import type { Totals } from '@shared/types.ts';
import { DurationText } from './DurationText.tsx';

export function TotalsBar({ totals, scheduledLabel = 'Target' }: { totals: Totals; scheduledLabel?: string }) {
  return (
    <div className="totals-bar">
      <div className="totals-figures">
        <Figure label="Worked"><DurationText minutes={totals.workedMinutes} /></Figure>
        <Figure label={scheduledLabel}><DurationText minutes={totals.targetMinutesScheduled} /></Figure>
        <Figure label="Balance">
          <DurationText minutes={totals.balanceMinutes} signed colored />
        </Figure>
        <span className="faint small">
          over {totals.trackedDayCount} tracked {totals.trackedDayCount === 1 ? 'day' : 'days'}
        </span>
      </div>

      {totals.missingWorkdays.length > 0 && (
        <span
          className="chip chip-warning"
          title={`Not recorded: ${totals.missingWorkdays.map(formatDayMonth).join(', ')}`}
        >
          ⚠ {totals.missingWorkdays.length} untracked{' '}
          {totals.missingWorkdays.length === 1 ? 'workday' : 'workdays'}
        </span>
      )}
    </div>
  );
}

function Figure({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <span className="figure">
      <span className="faint small">{label}</span>
      {children}
    </span>
  );
}
