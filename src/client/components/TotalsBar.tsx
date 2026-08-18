import { formatDayMonth } from '@shared/dates.ts';
import type { Totals } from '@shared/types.ts';
import { DurationText } from './DurationText.tsx';

export function TotalsBar({ totals, scheduledLabel = 'Ziel' }: { totals: Totals; scheduledLabel?: string }) {
  return (
    <div className="totals-bar">
      <div className="totals-figures">
        <Figure label="Gearbeitet"><DurationText minutes={totals.workedMinutes} /></Figure>
        <Figure label={scheduledLabel}><DurationText minutes={totals.targetMinutesScheduled} /></Figure>
        <Figure label="Saldo">
          <DurationText minutes={totals.balanceMinutes} signed colored />
        </Figure>
        <span className="faint small">
          über {totals.trackedDayCount} erfasste {totals.trackedDayCount === 1 ? 'Tag' : 'Tage'}
        </span>
      </div>

      {totals.missingWorkdays.length > 0 && (
        <span
          className="chip chip-warning"
          title={`Nicht erfasst: ${totals.missingWorkdays.map(formatDayMonth).join(', ')}`}
        >
          ⚠ {totals.missingWorkdays.length} nicht erfasste
          {totals.missingWorkdays.length === 1 ? 'r Arbeitstag' : ' Arbeitstage'}
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
