import { useMemo, useState } from 'react';
import { formatWeekdayDayMonth, todayIsoDateLocal } from '@shared/dates.ts';
import type { IsoDate } from '@shared/types.ts';
import { validateRange } from '@shared/validation.ts';
import { planVacationRange } from '@shared/vacation.ts';
import type { VacationSkipReason } from '@shared/vacation.ts';
import { ApiError } from '../api/client.ts';
import { useApplySpecialDays, useDeleteEntries, useEntriesInRange, useSettings } from '../api/queries.ts';

const SKIP_LABELS: Record<VacationSkipReason, string> = {
  day_off: 'frei',
  already_vacation: 'bereits Ferien',
  work: 'Arbeit erfasst',
  holiday: 'Feiertag',
  sick: 'Krank',
};

const days = (n: number) => `${n} ${n === 1 ? 'Tag' : 'Tage'}`;

/**
 * Books or removes Ferien over a date range. Every booked day is an ordinary
 * `vacation` entry, exactly like one set by hand in the week view.
 */
export function VacationRangeForm() {
  const today = todayIsoDateLocal();
  const [from, setFrom] = useState<IsoDate>(today);
  const [to, setTo] = useState<IsoDate>(today);
  const [note, setNote] = useState('');
  const [overwriteWork, setOverwriteWork] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  const rangeIssue = validateRange(from, to)[0];
  // Only query a valid range: the entries endpoint would reject anything else anyway.
  const { data: entries } = useEntriesInRange({ from: rangeIssue ? today : from, to: rangeIssue ? today : to });
  const { data: settings } = useSettings();
  const apply = useApplySpecialDays();
  const remove = useDeleteEntries();

  const plan = useMemo(
    () => (!rangeIssue && entries && settings ? planVacationRange({ from, to, entries, settings, overwriteWork }) : null),
    [rangeIssue, entries, settings, from, to, overwriteWork],
  );
  const shownSkips = plan?.skipped.filter((s) => s.reason !== 'day_off') ?? [];
  const dayOffCount = (plan?.skipped.length ?? 0) - shownSkips.length;

  const changeFrom = (value: string) => {
    setDone(null);
    setFrom(value);
    if (value && to < value) setTo(value);
  };

  const book = () => {
    if (!plan) return;
    setDone(null);
    remove.reset();
    apply.mutate(
      plan.book.map((date) => ({ date, dayType: 'vacation' as const, note: note.trim() || null })),
      { onSuccess: () => setDone(`✓ ${days(plan.book.length)} eingetragen`) },
    );
  };

  const unbook = () => {
    if (!plan) return;
    setDone(null);
    apply.reset();
    remove.mutate(plan.remove, { onSuccess: () => setDone(`✓ ${days(plan.remove.length)} entfernt`) });
  };

  const error = apply.error ?? remove.error;
  const busy = apply.isPending || remove.isPending;

  return (
    <div className="vacation-range">
      <h3>Ferien eintragen</h3>
      <div className="workload-inputs">
        <label className="labelled">
          <span>Von</span>
          <input type="date" value={from} onChange={(e) => changeFrom(e.target.value)} />
        </label>
        <label className="labelled">
          <span>Bis</span>
          <input type="date" value={to} min={from} onChange={(e) => { setDone(null); setTo(e.target.value); }} />
        </label>
        <label className="labelled">
          <span>Notiz</span>
          <input type="text" maxLength={500} placeholder="optional" value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
      </div>
      <label className="checkbox-row">
        <input
          type="checkbox" checked={overwriteWork}
          onChange={(e) => { setDone(null); setOverwriteWork(e.target.checked); }}
        />
        Bestehende Arbeitstage überschreiben
      </label>

      {rangeIssue && <p className="save-error small">{rangeIssue.message}</p>}
      {plan && (
        <p className="muted small vacation-range-preview">
          {days(plan.book.length)} {plan.book.length === 1 ? 'wird' : 'werden'} als Ferien eingetragen
          {dayOffCount > 0 && ` · ${dayOffCount} freie ${dayOffCount === 1 ? 'Tag' : 'Tage'} ausgelassen`}
          {plan.remove.length > 0 && ` · ${plan.remove.length} Ferientage im Zeitraum`}
        </p>
      )}
      {shownSkips.length > 0 && (
        <div className="period-history">
          {shownSkips.map((s) => (
            <div key={s.date} className="period-row">
              <span>{formatWeekdayDayMonth(s.date)}</span>
              <span className="muted">{SKIP_LABELS[s.reason]}</span>
              <span className="chip chip-off">bleibt</span>
            </div>
          ))}
        </div>
      )}

      <div className="settings-actions">
        <button type="button" className="primary" onClick={book} disabled={busy || !plan || plan.book.length === 0}>
          {apply.isPending ? 'Trägt ein…' : `${days(plan?.book.length ?? 0)} als Ferien eintragen`}
        </button>
        <button type="button" className="ghost danger" onClick={unbook} disabled={busy || !plan || plan.remove.length === 0}>
          {remove.isPending ? 'Entfernt…' : `${plan?.remove.length ?? 0} Ferientage entfernen`}
        </button>
        {done && <span className="saved-tick">{done}</span>}
        {error && (
          <span className="save-error">{error instanceof ApiError ? error.message : 'Konnte nicht gespeichert werden.'}</span>
        )}
      </div>
    </div>
  );
}
