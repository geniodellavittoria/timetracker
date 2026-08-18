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
        {isToday && <span className="chip chip-today">Today</span>}
      </div>

      <div className="day-inputs">
        {collapsed ? (
          <>
            <span className="chip chip-off">Day off</span>
            <button type="button" className="ghost small" onClick={() => setExpandDayOff(true)}>
              + Log hours anyway
            </button>
          </>
        ) : (
          <>
            <DayTypeSelect value={form.draft.dayType} onChange={(dayType) => form.update({ dayType })} />
            {isSpecial ? (
              <span className="muted counts-as">
                counts as target · <DurationText minutes={day.targetMinutes} />
              </span>
            ) : (
              <>
                <TimeField
                  label="Arrival"
                  value={form.draft.arrival}
                  invalid={!!form.issueFor('arrival')}
                  onChange={(arrival) => form.update({ arrival })}
                  onBlur={form.flush}
                />
                <span className="faint arrow">→</span>
                <TimeField
                  label="Leaving time"
                  value={form.draft.leave}
                  invalid={!!form.issueFor('leave')}
                  onChange={(leave) => form.update({ leave })}
                  onBlur={form.flush}
                />
                <BreakField
                  value={form.draft.breakMinutes}
                  invalid={!!form.issueFor('breakMinutes')}
                  onChange={(breakMinutes) => form.update({ breakMinutes })}
                  onBlur={form.flush}
                />
              </>
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
            aria-label={`Delete entry for ${day.date}`}
            title="Delete this entry"
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
  if (status === 'saving') return <span className="faint small" aria-live="polite">saving…</span>;
  if (status === 'saved') return <span className="saved-tick" aria-live="polite" title="Saved">✓</span>;
  if (status === 'error') return <span className="save-error" role="alert" title="Could not save">↻</span>;
  return <span className="save-slot" aria-hidden="true" />;
}
