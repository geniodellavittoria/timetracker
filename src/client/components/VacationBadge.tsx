import { Link } from 'react-router-dom';
import { todayIsoDateLocal } from '@shared/dates.ts';
import { formatVacationYear, vacationYearOf } from '@shared/vacation.ts';
import { useVacationSummary } from '../api/queries.ts';
import { VACATION_CARD_ID } from './VacationCard.tsx';
import { formatDays, VacationBar } from './VacationBar.tsx';

/** Remaining Ferien days of the running Ferien year. Hidden until an allowance is set. */
export function VacationBadge() {
  const today = todayIsoDateLocal();
  const { data: summary } = useVacationSummary({ year: vacationYearOf(today), today });
  if (!summary?.allowance) return null;

  const overbooked = summary.remainingDays < 0;
  return (
    <Link
      to={`/settings#${VACATION_CARD_ID}`}
      className={`badge vacation-badge ${overbooked ? 'badge-negative' : 'badge-neutral'}`}
      title={`Ferien ${formatVacationYear(summary.year)}: ${formatDays(summary.takenDays)} bezogen, ${formatDays(summary.plannedDays)} geplant, ${formatDays(summary.availableDays)} Anspruch`}
    >
      <span className="badge-label">Ferien</span>
      <strong className="num">
        {overbooked ? `${formatDays(-summary.remainingDays)} überbucht` : `${formatDays(summary.remainingDays)} übrig`}
      </strong>
      <VacationBar summary={summary} compact />
    </Link>
  );
}
