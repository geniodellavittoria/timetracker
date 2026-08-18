import { useEffect, useState } from 'react';
import { distributeWeeklyTarget, weeklyTargetMinutes } from '@shared/calc.ts';
import { WEEKDAY_LABELS_LONG } from '@shared/dates.ts';
import { formatDuration, hoursToMinutes, minutesToHoursValue } from '@shared/time.ts';
import type { ByWeekday, Settings } from '@shared/types.ts';
import { DurationText } from '../components/DurationText.tsx';
import { useSettings, useUpdateSettings } from '../api/queries.ts';

const PRESETS = [
  { label: '5 × 8h (40h)', weeklyMinutes: 2400 },
  { label: '5 × 8.4h (42h)', weeklyMinutes: 2520 },
  { label: '5 × 8.5h (42.5h)', weeklyMinutes: 2550 },
];

interface Draft {
  targets: number[];
  fullTimeWeeklyHours: number;
  workloadPercent: number;
  worksOn: boolean[];
}

function draftFrom(settings: Settings): Draft {
  return {
    targets: [...settings.targetMinutesByWeekday],
    fullTimeWeeklyHours: minutesToHoursValue(settings.fullTimeWeeklyMinutes),
    workloadPercent: settings.workloadPercentX10 / 10,
    worksOn: settings.targetMinutesByWeekday.map((m) => m > 0),
  };
}

export function SettingsPage() {
  const { data: settings, error } = useSettings();
  const update = useUpdateSettings();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => { if (settings) setDraft(draftFrom(settings)); }, [settings]);

  if (error) return <p className="error-banner">Could not load settings.</p>;
  if (!settings || !draft) return <p className="muted loading-note">Loading…</p>;

  const patch = (next: Partial<Draft>) => {
    setSaved(false);
    setDraft({ ...draft, ...next });
  };

  const workingDayCount = draft.worksOn.filter(Boolean).length;
  const plannedWeekly = weeklyTargetMinutes(
    hoursToMinutes(draft.fullTimeWeeklyHours || 0),
    Math.round((draft.workloadPercent || 0) * 10),
  );
  const perDay = workingDayCount > 0 ? Math.round(plannedWeekly / workingDayCount) : 0;

  const applyWorkload = () => {
    patch({ targets: [...distributeWeeklyTarget(plannedWeekly, draft.worksOn)] });
  };

  const currentWeekly = draft.targets.reduce((a, b) => a + b, 0);
  // Hand edits are kept, not silently overwritten — the panel just says so.
  const customised = currentWeekly !== plannedWeekly
    || draft.targets.some((m, i) => (m > 0) !== draft.worksOn[i]);

  const save = () => {
    update.mutate(
      {
        targetMinutesByWeekday: draft.targets as unknown as ByWeekday<number>,
        fullTimeWeeklyMinutes: hoursToMinutes(draft.fullTimeWeeklyHours || 0),
        workloadPercentX10: Math.round((draft.workloadPercent || 0) * 10),
      },
      { onSuccess: () => setSaved(true) },
    );
  };

  return (
    <section className="settings">
      <h2>Settings</h2>

      <div className="card settings-card">
        <h3>Workload</h3>
        <p className="muted small">
          Set your full-time week and percentage, tick the days you actually work, then apply.
          Any weekday you untick becomes a day off — it stops counting toward your target and is
          never reported as untracked.
        </p>

        <div className="workload-inputs">
          <label className="labelled">
            <span>Full-time week</span>
            <span className="input-with-suffix">
              <input
                type="number" min={0} max={168} step={0.5} inputMode="decimal"
                value={String(draft.fullTimeWeeklyHours)}
                onChange={(e) => patch({ fullTimeWeeklyHours: Number(e.target.value) })}
              />
              <span className="faint">h</span>
            </span>
          </label>

          <label className="labelled">
            <span>Workload</span>
            <span className="input-with-suffix">
              <input
                type="number" min={0} max={100} step={5} inputMode="decimal"
                value={String(draft.workloadPercent)}
                onChange={(e) => patch({ workloadPercent: Number(e.target.value) })}
              />
              <span className="faint">%</span>
            </span>
          </label>

          <div className="presets">
            {PRESETS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                className="small"
                onClick={() => patch({ fullTimeWeeklyHours: minutesToHoursValue(preset.weeklyMinutes) })}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        <fieldset className="works-on">
          <legend className="faint small">I work on</legend>
          {WEEKDAY_LABELS_LONG.map((label, i) => (
            <label key={label} className="works-on-day">
              <input
                type="checkbox"
                checked={draft.worksOn[i] ?? false}
                onChange={(e) => {
                  const worksOn = [...draft.worksOn];
                  worksOn[i] = e.target.checked;
                  patch({ worksOn });
                }}
              />
              <span>{label.slice(0, 3)}</span>
            </label>
          ))}
        </fieldset>

        <div className="workload-result">
          <span>
            Weekly target <strong><DurationText minutes={plannedWeekly} /></strong>
            {workingDayCount > 0 && (
              <> across {workingDayCount} {workingDayCount === 1 ? 'day' : 'days'} →{' '}
                <strong>{formatDuration(perDay)}</strong> per day</>
            )}
          </span>
          <button type="button" onClick={applyWorkload}>Apply to weekdays</button>
        </div>
      </div>

      <div className="card settings-card">
        <h3>Hours per weekday</h3>
        <p className="muted small">
          What each day actually counts for. Editing a value by hand is fine — it just means the
          workload panel above no longer matches.
        </p>

        <div className="weekday-grid">
          {WEEKDAY_LABELS_LONG.map((label, i) => {
            const minutes = draft.targets[i] ?? 0;
            return (
              <label key={label} className="weekday-row">
                <span className="weekday-name">{label}</span>
                <span className="input-with-suffix">
                  <input
                    type="number" min={0} max={24} step={0.25} inputMode="decimal"
                    value={String(minutesToHoursValue(minutes))}
                    aria-label={`${label} target hours`}
                    onChange={(e) => {
                      const targets = [...draft.targets];
                      targets[i] = hoursToMinutes(Number(e.target.value) || 0);
                      patch({ targets });
                    }}
                  />
                  <span className="faint">h</span>
                </span>
                <span className="weekday-note">
                  {minutes === 0
                    ? <span className="chip chip-off">Day off</span>
                    : <span className="faint num">{formatDuration(minutes)}</span>}
                </span>
              </label>
            );
          })}
        </div>

        <div className="weekly-total">
          <span>Weekly total <strong><DurationText minutes={currentWeekly} /></strong></span>
          {customised && <span className="chip chip-warning">customised</span>}
        </div>
      </div>

      <div className="settings-actions">
        <button type="button" className="primary" onClick={save} disabled={update.isPending}>
          {update.isPending ? 'Saving…' : 'Save settings'}
        </button>
        {saved && <span className="saved-tick">✓ Saved</span>}
        {update.error && <span className="save-error">Could not save.</span>}
        <p className="faint small">
          Targets are not versioned: changing them recalculates every past balance too.
        </p>
      </div>
    </section>
  );
}
