import { useState } from 'react';
import { formatDayMonth, WEEKDAY_LABELS } from '@shared/dates.ts';
import { workedMinutesFor } from '@shared/calc.ts';
import type { DaySummary, Settings, TimeEntry, TimeEntryInput } from '@shared/types.ts';
import { BreakField } from './BreakField.tsx';
import { DayTypeSelect } from './DayTypeSelect.tsx';
import { DurationText } from './DurationText.tsx';
import { TimeField } from './TimeField.tsx';
import { draftToInput, useDayForm } from '../hooks/useDayForm.ts';

export function DayRow({
  day,
  settings,
  isToday,
  onSave,
  onDelete,
}: {
  day: DaySummary;
  settings: Settings;
  isToday: boolean;
  onSave: (input: TimeEntryInput) => Promise<unknown>;
  onDelete: () => Promise<unknown>;
}) {
  const isDayOff = day.targetMinutes === 0;
  // A day off stays collapsed until asked for, but never becomes uneditable —
  // occasionally you do work on one, and those hours are pure overtime.
  const [expandDayOff, setExpandDayOff] = useState(day.hasEntry);
  const form = useDayForm({ entry: day.entry, onSave });

  const collapsed = isDayOff && !expandDayOff && !day.hasEntry;
  const isSpecial = form.draft.dayType !== 'normal';

  // Recomputed on every keystroke from the shared module — no network involved,
  // so the number moves as you type and matches exactly what gets stored.
  const liveEntry: TimeEntry = { ...draftToInput(form.draft), date: day.date, updatedAt: '' };
  const liveWorked = form.isEmpty ? null : workedMinutesFor(liveEntry, settings);
  const liveBalance = liveWorked === null ? null : liveWorked - day.targetMinutes;

  return (
    <div
      className={[
        'day-row',
        isDayOff ? 'is-day-off' : '',
        isToday ? 'is-today' : '',
        day.isMissingWorkday ? 'is-missing' : '',
      ].filter(Boolean).join(' ')}
    >
      <div className="day-label">
        <strong>{WEEKDAY_LABELS[day.weekday]}</strong>
        <span className="faint">{formatDayMonth(day.date)}</span>
        {isToday && <span className="chip chip-today">Heute</span>}
      </div>

      <div className="day-inputs">
        {collapsed ? (
          <>
            <span className="chip chip-off">Frei</span>
            <button type="button" className="ghost small" onClick={() => setExpandDayOff(true)}>
              + Trotzdem Stunden erfassen
            </button>
          </>
        ) : (
          <>
            <DayTypeSelect value={form.draft.dayType} onChange={(dayType) => form.update({ dayType })} />
            {isSpecial ? (
              <span className="muted counts-as">
                zählt als Ziel · <DurationText minutes={day.targetMinutes} />
              </span>
            ) : (
              <div className="blocks">
                {form.draft.blocks.map((block, i) => {
                  // A single block keeps the plain labels (matches the old
                  // one-block-per-day UI); a second block onward disambiguates
                  // them, since two inputs sharing the label "Kommen" would be
                  // indistinguishable to a screen reader.
                  const suffix = form.draft.blocks.length > 1 ? ` (Block ${i + 1})` : '';
                  return (
                    <div key={i} className="block-row">
                      <TimeField
                        label={`Kommen${suffix}`}
                        value={block.arrival}
                        invalid={!!form.issueFor(`blocks.${i}.arrival`)}
                        onChange={(arrival) => form.updateBlock(i, { arrival })}
                        onBlur={form.flush}
                      />
                      <span className="faint arrow">→</span>
                      <TimeField
                        label={`Gehen${suffix}`}
                        value={block.leave}
                        invalid={!!form.issueFor(`blocks.${i}.leave`)}
                        onChange={(leave) => form.updateBlock(i, { leave })}
                        onBlur={form.flush}
                      />
                      <BreakField
                        label={`Pause in Minuten${suffix}`}
                        value={block.breakMinutes}
                        invalid={!!form.issueFor(`blocks.${i}.breakMinutes`)}
                        onChange={(breakMinutes) => form.updateBlock(i, { breakMinutes })}
                        onBlur={form.flush}
                      />
                      {form.draft.blocks.length > 1 && (
                        <button
                          type="button"
                          className="ghost small danger"
                          aria-label={`Zeitblock ${i + 1} entfernen`}
                          title="Zeitblock entfernen"
                          onClick={() => form.removeBlock(i)}
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  );
                })}
                <button type="button" className="ghost small" onClick={form.addBlock}>
                  + Weiterer Zeitblock
                </button>
              </div>
            )}
          </>
        )}
      </div>

      <div className="day-worked"><DurationText minutes={liveWorked} /></div>
      <div className="day-balance">
        <DurationText minutes={liveBalance} signed colored />
      </div>

      <div className="day-status">
        <SaveIndicator status={form.status} />
        {day.hasEntry && (
          <button
            type="button"
            className="ghost small danger"
            aria-label={`Eintrag für ${day.date} löschen`}
            title="Diesen Eintrag löschen"
            onClick={() => { void onDelete(); }}
          >
            ✕
          </button>
        )}
      </div>

      {form.issues.length > 0 && (
        <p className="day-error" role="alert">{form.issues[0]!.message}</p>
      )}
    </div>
  );
}

function SaveIndicator({ status }: { status: 'idle' | 'saving' | 'saved' | 'error' }) {
  if (status === 'saving') return <span className="faint small" aria-live="polite">speichert…</span>;
  if (status === 'saved') return <span className="saved-tick" aria-live="polite" title="Gespeichert">✓</span>;
  if (status === 'error') return <span className="save-error" role="alert" title="Konnte nicht gespeichert werden">↻</span>;
  return <span className="save-slot" aria-hidden="true" />;
}
