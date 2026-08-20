import { useMemo, useState } from 'react';
import { formatIsoDateDMY, todayIsoDateLocal } from '@shared/dates.ts';
import { CANTONS, holidaysForCanton } from '@shared/holidays.ts';
import type { CantonCode } from '@shared/holidays.ts';
import { ApiError } from '../api/client.ts';
import { useApplyHolidays, useEntriesInRange } from '../api/queries.ts';

const STORAGE_KEY = 'timetracker.holidayCanton';

function isCantonCode(value: string): value is CantonCode {
  return CANTONS.some((c) => c.code === value);
}

function loadStoredCanton(): CantonCode | '' {
  try {
    const stored = localStorage.getItem(STORAGE_KEY) ?? '';
    return isCantonCode(stored) ? stored : '';
  } catch {
    return '';
  }
}

function storeCanton(value: string) {
  try {
    localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // Best-effort convenience only — a private-browsing tab or a full quota
    // just means the canton isn't pre-selected next time.
  }
}

/**
 * Seeds a year's holidays for one canton in one action: each candidate date
 * from `holidaysForCanton` becomes an ordinary `holiday`-type entry, exactly
 * like one created by hand in `DayRow`. Dates that already carry an entry
 * are left untouched. Once applied, every day is a normal entry the user can
 * edit or delete individually — there is no ongoing link back to "canton",
 * which is what lets Gemeinde-specific differences just be a manual edit.
 */
export function HolidayTemplateCard() {
  const [canton, setCanton] = useState<CantonCode | ''>(loadStoredCanton);
  const [year, setYear] = useState(() => Number(todayIsoDateLocal().slice(0, 4)));
  const [applied, setApplied] = useState(false);

  const from = `${year}-01-01`;
  const to = `${year}-12-31`;
  const { data: existingEntries } = useEntriesInRange({ from, to });
  const apply = useApplyHolidays();

  const candidates = useMemo(() => (canton ? holidaysForCanton(canton, year) : []), [canton, year]);
  const existingDates = useMemo(
    () => new Set((existingEntries ?? []).map((e) => e.date)),
    [existingEntries],
  );
  const rows = candidates.map((h) => ({ ...h, alreadyTaken: existingDates.has(h.date) }));
  const toCreate = rows.filter((r) => !r.alreadyTaken);

  const selectCanton = (value: string) => {
    setApplied(false);
    setCanton(isCantonCode(value) ? value : '');
    storeCanton(value);
  };

  const changeYear = (value: string) => {
    setApplied(false);
    const parsed = Number(value);
    if (Number.isInteger(parsed)) setYear(parsed);
  };

  const applyTemplate = () => {
    apply.mutate(
      toCreate.map(({ date, name }) => ({ date, name })),
      { onSuccess: () => setApplied(true) },
    );
  };

  return (
    <>
      <p className="muted small">
        Kantonsvorlage übernehmen, dann einzelne Tage bei Bedarf anpassen — Gemeinden weichen
        teils von der kantonalen Liste ab. Diese Liste ist ein bestmöglicher Ausgangspunkt, keine
        rechtsverbindliche Quelle: vor dem Anwenden mit dem eigenen Kanton bzw. der eigenen
        Gemeinde abgleichen. Angewendete Tage sind normale Einträge — änderbar oder löschbar wie
        jeder andere Tag.
      </p>

      <div className="workload-inputs">
        <label className="labelled">
          <span>Kanton</span>
          <select value={canton} onChange={(e) => selectCanton(e.target.value)}>
            <option value="">Wählen…</option>
            {CANTONS.map((c) => (
              <option key={c.code} value={c.code}>{c.name} ({c.code})</option>
            ))}
          </select>
        </label>

        <label className="labelled">
          <span>Jahr</span>
          <input
            type="number" min={2000} max={2100} step={1}
            value={String(year)}
            onChange={(e) => changeYear(e.target.value)}
          />
        </label>
      </div>

      {canton && (
        <>
          <div className="period-history">
            {rows.map((r) => (
              <div key={r.date} className="period-row">
                <span>{formatIsoDateDMY(r.date)}</span>
                <span>{r.name}</span>
                <span className={r.alreadyTaken ? 'chip chip-off' : 'chip chip-today'}>
                  {r.alreadyTaken ? 'bereits erfasst' : 'wird angelegt'}
                </span>
              </div>
            ))}
          </div>

          <div className="settings-actions">
            <button
              type="button" className="primary" onClick={applyTemplate}
              disabled={apply.isPending || toCreate.length === 0}
            >
              {apply.isPending ? 'Wendet an…' : `${toCreate.length} Feiertage anwenden`}
            </button>
            {applied && <span className="saved-tick">✓ Angewendet</span>}
            {apply.error && (
              <span className="save-error">
                {apply.error instanceof ApiError ? apply.error.message : 'Konnte nicht angewendet werden.'}
              </span>
            )}
          </div>
        </>
      )}
    </>
  );
}
