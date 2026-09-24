import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { formatIsoDateDMY, todayIsoDateLocal } from '@shared/dates.ts';
import { formatVacationYear, vacationYearOf } from '@shared/vacation.ts';
import { ApiError } from '../api/client.ts';
import { useDeleteVacationAllowance, useUpsertVacationAllowance, useVacationSummary } from '../api/queries.ts';
import { formatDays, VacationBar } from './VacationBar.tsx';
import { VacationRangeForm } from './VacationRangeForm.tsx';

export const VACATION_CARD_ID = 'vacation-card';

/**
 * The Ferien allowance for one Ferien year (1 Aug – 31 Jul), and how much of it
 * is used up. Taken and planned days are always counted from `vacation`
 * entries, whether set per day in the week view or over a range below.
 */
export function VacationCard() {
  const today = todayIsoDateLocal();
  const [year, setYear] = useState(() => vacationYearOf(today));
  const { data: summary, error } = useVacationSummary({ year, today });
  const upsert = useUpsertVacationAllowance();
  const remove = useDeleteVacationAllowance();

  const [days, setDays] = useState('');
  const [carryOver, setCarryOver] = useState('');
  const [saved, setSaved] = useState(false);

  // While another year loads, `summary` is still the previous year's placeholder — never show it as this year's.
  const current = summary?.year === year ? summary : undefined;

  // Reload the inputs whenever another year (or a fresh save) comes back from the server.
  const allowance = current?.allowance;
  const allowanceVersion = allowance === undefined ? null : `${year}:${allowance?.updatedAt ?? 'none'}`;
  useEffect(() => {
    if (allowance === undefined) return;
    setDays(allowance ? String(allowance.days) : '');
    setCarryOver(allowance ? String(allowance.carryOverDays) : '0');
  }, [allowanceVersion]); // only when the server copy changes, never on every refetch

  // The header badge links to /settings#vacation-card — open and reveal the section.
  const ref = useRef<HTMLDetailsElement>(null);
  const { hash } = useLocation();
  useEffect(() => {
    if (hash === `#${VACATION_CARD_ID}` && ref.current) {
      ref.current.open = true;
      ref.current.scrollIntoView({ block: 'start' });
    }
  }, [hash]);

  const changeYear = (delta: number) => {
    setSaved(false);
    upsert.reset();
    setYear((y) => y + delta);
  };

  const save = () => {
    setSaved(false);
    upsert.mutate(
      { year, input: { days: Number(days), carryOverDays: Number(carryOver || 0) } },
      { onSuccess: () => setSaved(true) },
    );
  };

  const errorText = (err: unknown, fallback: string) => (err instanceof ApiError ? err.message : fallback);

  return (
    <details className="card settings-section" id={VACATION_CARD_ID} ref={ref}>
      <summary>
        <span className="section-title">Ferien</span>
        <span className="section-summary faint">
          {formatVacationYear(year)}
          {current && (current.allowance
            ? ` · ${formatDays(current.takenDays)} von ${formatDays(current.availableDays)} Tagen bezogen`
            : ' · kein Anspruch erfasst')}
        </span>
      </summary>
      <div className="section-body">
        <p className="muted small">
          Ferienanspruch pro Ferienjahr (1. August bis 31. Juli). Bezogene und geplante Tage werden
          aus den als „Ferien“ erfassten Tagen gezählt — in der Woche einzeln oder unten für einen
          ganzen Zeitraum eingetragen. Nur Tage mit Sollzeit zählen, ein Ferientag am Wochenende
          oder an einem freien Tag nicht.
        </p>

        <div className="period-nav vacation-year-nav">
          <button type="button" className="ghost" onClick={() => changeYear(-1)} aria-label="Vorheriges Ferienjahr">‹</button>
          <strong className="num">{formatVacationYear(year)}</strong>
          <button type="button" className="ghost" onClick={() => changeYear(1)} aria-label="Nächstes Ferienjahr">›</button>
          {current && (
            <span className="faint small">
              {formatIsoDateDMY(current.from)} – {formatIsoDateDMY(current.to)}
            </span>
          )}
        </div>

        {error && <p className="error-banner">Die Ferien konnten nicht geladen werden.</p>}
        {current?.allowance && <VacationBar summary={current} />}

        <div className="workload-inputs">
          <label className="labelled">
            <span>Ferientage</span>
            <span className="input-with-suffix">
              <input
                type="number" min={0} max={365} step={0.5} inputMode="decimal"
                value={days}
                onChange={(e) => { setSaved(false); setDays(e.target.value); }}
              />
              <span className="faint small">Tage</span>
            </span>
          </label>
          <label className="labelled">
            <span>Übertrag Vorjahr</span>
            <span className="input-with-suffix">
              <input
                type="number" min={-365} max={365} step={0.5} inputMode="decimal"
                value={carryOver}
                onChange={(e) => { setSaved(false); setCarryOver(e.target.value); }}
              />
              <span className="faint small">Tage</span>
            </span>
          </label>
        </div>

        <div className="settings-actions">
          <button type="button" className="primary" onClick={save} disabled={upsert.isPending || days === ''}>
            {upsert.isPending ? 'Speichert…' : 'Ferienanspruch speichern'}
          </button>
          {current?.allowance && (
            <button type="button" className="ghost" onClick={() => remove.mutate(year)} disabled={remove.isPending}>
              Anspruch löschen
            </button>
          )}
          {saved && <span className="saved-tick">✓ Gespeichert</span>}
          {upsert.error && !saved && <span className="save-error">{errorText(upsert.error, 'Konnte nicht gespeichert werden.')}</span>}
          {remove.error && <span className="save-error">{errorText(remove.error, 'Konnte nicht gelöscht werden.')}</span>}
        </div>

        <VacationRangeForm />
      </div>
    </details>
  );
}
