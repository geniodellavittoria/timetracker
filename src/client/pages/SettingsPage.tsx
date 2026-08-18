import { useEffect, useState } from 'react';
import { distributeWeeklyTarget, weeklyTargetMinutes } from '@shared/calc.ts';
import { WEEKDAY_LABELS, WEEKDAY_LABELS_LONG } from '@shared/dates.ts';
import { formatDuration, hoursToMinutes, minutesToHoursValue } from '@shared/time.ts';
import type { ByWeekday, Settings } from '@shared/types.ts';
import { DurationText } from '../components/DurationText.tsx';
import { useSettings, useUpdateSettings } from '../api/queries.ts';

const PRESETS = [
  { label: '5 × 8 Std (40 Std)', weeklyMinutes: 2400 },
  { label: '5 × 8.4 Std (42 Std)', weeklyMinutes: 2520 },
  { label: '5 × 8.5 Std (42.5 Std)', weeklyMinutes: 2550 },
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

  if (error) return <p className="error-banner">Einstellungen konnten nicht geladen werden.</p>;
  if (!settings || !draft) return <p className="muted loading-note">Lädt…</p>;

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

  // Applied inline from each workload input's own handler (not a useEffect on
  // the draft) so it never fires on initial load and clobbers hand-tuned
  // per-weekday hours the moment Settings opens — only an actual change to
  // one of these three inputs should re-distribute the targets.
  const applyWorkloadWith = (
    next: Partial<Pick<Draft, 'fullTimeWeeklyHours' | 'workloadPercent' | 'worksOn'>>,
  ) => {
    const fullTimeWeeklyHours = next.fullTimeWeeklyHours ?? draft.fullTimeWeeklyHours;
    const workloadPercent = next.workloadPercent ?? draft.workloadPercent;
    const worksOn = next.worksOn ?? draft.worksOn;
    const weekly = weeklyTargetMinutes(
      hoursToMinutes(fullTimeWeeklyHours || 0),
      Math.round((workloadPercent || 0) * 10),
    );
    patch({ ...next, targets: [...distributeWeeklyTarget(weekly, worksOn)] });
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
      <h2>Einstellungen</h2>

      <div className="card settings-card">
        <h3>Pensum</h3>
        <p className="muted small">
          Vollzeitpensum und Prozentsatz eingeben, die tatsächlichen Arbeitstage ankreuzen und
          anwenden. Ein abgewählter Wochentag wird zum freien Tag — er zählt nicht mehr zum Ziel
          und wird nie als nicht erfasst gemeldet.
        </p>

        <div className="workload-inputs">
          <label className="labelled">
            <span>Vollzeit-Woche</span>
            <span className="input-with-suffix">
              <input
                type="number" min={0} max={168} step={0.5} inputMode="decimal"
                value={String(draft.fullTimeWeeklyHours)}
                onChange={(e) => applyWorkloadWith({ fullTimeWeeklyHours: Number(e.target.value) })}
              />
              <span className="faint">Std</span>
            </span>
          </label>

          <label className="labelled">
            <span>Pensum</span>
            <span className="input-with-suffix">
              <input
                type="number" min={0} max={100} step={5} inputMode="decimal"
                value={String(draft.workloadPercent)}
                onChange={(e) => applyWorkloadWith({ workloadPercent: Number(e.target.value) })}
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
                onClick={() => applyWorkloadWith({ fullTimeWeeklyHours: minutesToHoursValue(preset.weeklyMinutes) })}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        <fieldset className="works-on">
          <legend className="faint small">Ich arbeite am</legend>
          {WEEKDAY_LABELS_LONG.map((label, i) => (
            <label key={label} className="works-on-day">
              <input
                type="checkbox"
                checked={draft.worksOn[i] ?? false}
                onChange={(e) => {
                  const worksOn = [...draft.worksOn];
                  worksOn[i] = e.target.checked;
                  applyWorkloadWith({ worksOn });
                }}
              />
              <span>{WEEKDAY_LABELS[i]}</span>
            </label>
          ))}
        </fieldset>

        <div className="workload-result">
          <span>
            Wochenziel <strong><DurationText minutes={plannedWeekly} /></strong>
            {workingDayCount > 0 && (
              <> auf {workingDayCount} {workingDayCount === 1 ? 'Tag' : 'Tage'} verteilt →{' '}
                <strong>{formatDuration(perDay)}</strong> pro Tag</>
            )}
          </span>
        </div>
      </div>

      <div className="card settings-card">
        <h3>Stunden pro Wochentag</h3>
        <p className="muted small">
          Was jeder Tag effektiv zählt. Ein Wert kann von Hand angepasst werden — das Pensum-Feld
          oben stimmt dann einfach nicht mehr überein.
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
                    aria-label={`${label} Zielstunden`}
                    onChange={(e) => {
                      const targets = [...draft.targets];
                      targets[i] = hoursToMinutes(Number(e.target.value) || 0);
                      patch({ targets });
                    }}
                  />
                  <span className="faint">Std</span>
                </span>
                <span className="weekday-note">
                  {minutes === 0
                    ? <span className="chip chip-off">Frei</span>
                    : <span className="faint num">{formatDuration(minutes)}</span>}
                </span>
              </label>
            );
          })}
        </div>

        <div className="weekly-total">
          <span>Wochentotal <strong><DurationText minutes={currentWeekly} /></strong></span>
          {customised && <span className="chip chip-warning">angepasst</span>}
        </div>
      </div>

      <div className="settings-actions">
        <button type="button" className="primary" onClick={save} disabled={update.isPending}>
          {update.isPending ? 'Speichert…' : 'Einstellungen speichern'}
        </button>
        {saved && <span className="saved-tick">✓ Gespeichert</span>}
        {update.error && <span className="save-error">Konnte nicht gespeichert werden.</span>}
        <p className="faint small">
          Ziele werden nicht versioniert: Eine Änderung berechnet auch alle vergangenen Salden neu.
        </p>
      </div>
    </section>
  );
}
