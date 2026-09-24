import { targetMinutesFor } from './calc.ts';
import { eachDateInRange } from './dates.ts';
import type { IsoDate, Settings, TimeEntry, VacationAllowance, VacationSummary } from './types.ts';

/** The Ferien year a date falls in, keyed by its start year: 1 Aug onward is that year, before it the previous one. */
export function vacationYearOf(date: IsoDate): number {
  const year = Number(date.slice(0, 4));
  return date.slice(5) >= '08-01' ? year : year - 1;
}

export function vacationYearRange(year: number): { from: IsoDate; to: IsoDate } {
  return { from: `${year}-08-01`, to: `${year + 1}-07-31` };
}

/** '2026/27'. */
export function formatVacationYear(year: number): string {
  return `${year}/${String((year + 1) % 100).padStart(2, '0')}`;
}

/**
 * Counts `vacation` entries within the Ferien year. A Ferien entry on a day
 * whose target is 0 (weekend, part-time day off) uses up nothing — the same
 * rule that gives it a balance of 0.
 */
export function summarizeVacation(args: {
  year: number;
  allowance: VacationAllowance | null;
  entries: readonly TimeEntry[];
  settings: Settings;
  today: IsoDate;
}): VacationSummary {
  const { year, allowance, entries, settings, today } = args;
  const { from, to } = vacationYearRange(year);

  const takenDates: IsoDate[] = [];
  const plannedDates: IsoDate[] = [];
  for (const entry of entries) {
    if (entry.dayType !== 'vacation' || entry.date < from || entry.date > to) continue;
    if (targetMinutesFor(entry.date, settings) === 0) continue;
    (entry.date <= today ? takenDates : plannedDates).push(entry.date);
  }

  const availableDays = allowance ? allowance.days + allowance.carryOverDays : 0;
  return {
    year,
    from,
    to,
    today,
    allowance,
    availableDays,
    takenDays: takenDates.length,
    plannedDays: plannedDates.length,
    remainingDays: availableDays - takenDates.length - plannedDates.length,
    takenDates,
    plannedDates,
  };
}

export type VacationSkipReason = 'day_off' | 'already_vacation' | 'work' | 'holiday' | 'sick';

export interface VacationRangePlan {
  /** Dates that become Ferien entries when booking. */
  book: IsoDate[];
  /** Dates left alone when booking, with why. */
  skipped: { date: IsoDate; reason: VacationSkipReason }[];
  /** Existing Ferien entries in the range — what "remove" deletes. */
  remove: IsoDate[];
}

/**
 * What booking or removing Ferien over `from`–`to` would do. Only workdays
 * are booked (a day off needs no Ferien); Feiertag and Krank entries are
 * never touched; Arbeit entries only with `overwriteWork`.
 */
export function planVacationRange(args: {
  from: IsoDate;
  to: IsoDate;
  entries: readonly TimeEntry[];
  settings: Settings;
  overwriteWork: boolean;
}): VacationRangePlan {
  const { from, to, entries, settings, overwriteWork } = args;
  const byDate = new Map(entries.map((e) => [e.date, e]));
  const plan: VacationRangePlan = { book: [], skipped: [], remove: [] };

  for (const date of eachDateInRange(from, to)) {
    const entry = byDate.get(date);
    if (entry?.dayType === 'vacation') plan.remove.push(date);

    const reason: VacationSkipReason | null =
      entry?.dayType === 'vacation' ? 'already_vacation'
      : entry?.dayType === 'holiday' ? 'holiday'
      : entry?.dayType === 'sick' ? 'sick'
      : targetMinutesFor(date, settings) === 0 ? 'day_off'
      : entry?.dayType === 'normal' && !overwriteWork ? 'work'
      : null;
    if (reason) plan.skipped.push({ date, reason });
    else plan.book.push(date);
  }
  return plan;
}
