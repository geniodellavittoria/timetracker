import { useEffect, useState } from 'react';
import { distributeWeeklyTarget, periodFor, weeklyTargetMinutes } from '@shared/calc.ts';
import { formatIsoDateDMY, todayIsoDateLocal, WEEKDAY_LABELS, WEEKDAY_LABELS_LONG } from '@shared/dates.ts';
import { formatDuration, hoursToMinutes, minutesToHoursValue } from '@shared/time.ts';
import type { ByWeekday, IsoDate, SettingsPeriod, SettingsPeriodInput } from '@shared/types.ts';
import { ApiError } from '../api/client.ts';
import { DurationText } from '../components/DurationText.tsx';
import { HolidayTemplateCard } from '../components/HolidayTemplateCard.tsx';
import {
  useCreateSettingsPeriod, useDeleteSettingsPeriod, useSettings, useUpdateSettingsPeriod,
} from '../api/queries.ts';

const PRESETS = [
  { label: '5 × 8 Std (40 Std)', weeklyMinutes: 2400 },
  { label: '5 × 8.4 Std (42 Std)', weeklyMinutes: 2520 },
  { label: '5 × 8.5 Std (42.5 Std)', weeklyMinutes: 2550 },
];

interface WorkloadDraft {
  targets: number[];
  fullTimeWeeklyHours: number;
  workloadPercent: number;
  worksOn: boolean[];
}

type WorkloadFields = Pick<WorkloadDraft, 'fullTimeWeeklyHours' | 'workloadPercent' | 'worksOn'>;

function draftFromPeriod(period: SettingsPeriod): WorkloadDraft {
  return {
    targets: [...period.targetMinutesByWeekday],
    fullTimeWeeklyHours: minutesToHoursValue(period.fullTimeWeeklyMinutes),
    workloadPercent: period.workloadPercentX100 / 100,
    worksOn: period.targetMinutesByWeekday.map((m) => m > 0),
  };
}

/**
 * The single place a workload snapshot's per-weekday minutes get derived
 * from hours/%/working-days — shared by both cards below so this
 * calculation only ever exists in one place.
 */
function computeTargets(fields: WorkloadFields): number[] {
  const weekly = weeklyTargetMinutes(
    hoursToMinutes(fields.fullTimeWeeklyHours || 0),
    Math.round((fields.workloadPercent || 0) * 100),
  );
  return [...distributeWeeklyTarget(weekly, fields.worksOn)];
}

function plannedWeeklyFor(fields: WorkloadFields): number {
  return weeklyTargetMinutes(
    hoursToMinutes(fields.fullTimeWeeklyHours || 0),
    Math.round((fields.workloadPercent || 0) * 100),
  );
}

function periodToInput(effectiveFrom: IsoDate, draft: WorkloadDraft): SettingsPeriodInput {
  return {
    effectiveFrom,
    targetMinutesByWeekday: draft.targets as unknown as ByWeekday<number>,
    fullTimeWeeklyMinutes: hoursToMinutes(draft.fullTimeWeeklyHours || 0),
    workloadPercentX100: Math.round((draft.workloadPercent || 0) * 100),
  };
}

function apiErrorMessage(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback;
}

export function SettingsPage() {
  const { data: periods, error } = useSettings();
  const createPeriod = useCreateSettingsPeriod();
  const updatePeriod = useUpdateSettingsPeriod();
  const deletePeriod = useDeleteSettingsPeriod();

  const today = todayIsoDateLocal();

  const [currentDraft, setCurrentDraft] = useState<WorkloadDraft | null>(null);
  const [currentSaved, setCurrentSaved] = useState(false);
  const [scheduleForm, setScheduleForm] = useState<{ draft: WorkloadDraft; effectiveFrom: IsoDate; editingId: number | null } | null>(null);

  const currentPeriod = periods && periods.length > 0 ? periodFor(today, periods) ?? periods[0]! : null;

  // Resets whenever the *server's* view of the current period changes (first
  // load, or right after a save) — not on every render, so in-progress edits
  // survive unrelated re-renders.
  useEffect(() => {
    if (currentPeriod) setCurrentDraft(draftFromPeriod(currentPeriod));
  }, [currentPeriod?.id, currentPeriod?.updatedAt]);

  useEffect(() => {
    if (!scheduleForm && currentPeriod) {
      setScheduleForm({ draft: draftFromPeriod(currentPeriod), effectiveFrom: today, editingId: null });
    }
  }, [scheduleForm, currentPeriod, today]);

  if (error) return <p className="error-banner">Einstellungen konnten nicht geladen werden.</p>;
  if (!periods || !currentPeriod || !currentDraft || !scheduleForm) {
    return <p className="muted loading-note">Lädt…</p>;
  }

  const patchCurrent = (next: Partial<WorkloadDraft>) => {
    setCurrentSaved(false);
    setCurrentDraft({ ...currentDraft, ...next });
  };

  // Applied inline from each workload input's own handler (not a useEffect on
  // the draft) so it never fires on initial load and clobbers hand-tuned
  // per-weekday hours the moment Settings opens — only an actual change to
  // one of these three inputs should re-distribute the targets.
  const applyCurrentWorkloadWith = (next: Partial<WorkloadFields>) => {
    const fields: WorkloadFields = {
      fullTimeWeeklyHours: next.fullTimeWeeklyHours ?? currentDraft.fullTimeWeeklyHours,
      workloadPercent: next.workloadPercent ?? currentDraft.workloadPercent,
      worksOn: next.worksOn ?? currentDraft.worksOn,
    };
    patchCurrent({ ...next, targets: computeTargets(fields) });
  };

  const currentPlannedWeekly = plannedWeeklyFor(currentDraft);
  const currentWorkingDayCount = currentDraft.worksOn.filter(Boolean).length;
  const currentPerDay = currentWorkingDayCount > 0 ? Math.round(currentPlannedWeekly / currentWorkingDayCount) : 0;
  const currentWeekly = currentDraft.targets.reduce((a, b) => a + b, 0);
  // Hand edits are kept, not silently overwritten — the panel just says so.
  const customised = currentWeekly !== currentPlannedWeekly
    || currentDraft.targets.some((m, i) => (m > 0) !== currentDraft.worksOn[i]);

  const saveCurrent = () => {
    updatePeriod.mutate(
      { id: currentPeriod.id, input: periodToInput(currentPeriod.effectiveFrom, currentDraft) },
      { onSuccess: () => setCurrentSaved(true) },
    );
  };

  const applyScheduleWorkloadWith = (next: Partial<WorkloadFields>) => {
    const fields: WorkloadFields = {
      fullTimeWeeklyHours: next.fullTimeWeeklyHours ?? scheduleForm.draft.fullTimeWeeklyHours,
      workloadPercent: next.workloadPercent ?? scheduleForm.draft.workloadPercent,
      worksOn: next.worksOn ?? scheduleForm.draft.worksOn,
    };
    setScheduleForm({
      ...scheduleForm,
      draft: { ...scheduleForm.draft, ...next, targets: computeTargets(fields) },
    });
  };

  const resetScheduleForm = () => setScheduleForm({ draft: draftFromPeriod(currentPeriod), effectiveFrom: today, editingId: null });

  const startEditingPeriod = (period: SettingsPeriod) => {
    setScheduleForm({ draft: draftFromPeriod(period), effectiveFrom: period.effectiveFrom, editingId: period.id });
  };

  const submitScheduleForm = () => {
    const input = periodToInput(scheduleForm.effectiveFrom, scheduleForm.draft);
    if (scheduleForm.editingId !== null) {
      updatePeriod.mutate({ id: scheduleForm.editingId, input }, { onSuccess: resetScheduleForm });
    } else {
      createPeriod.mutate(input, { onSuccess: resetScheduleForm });
    }
  };

  const schedulePlannedWeekly = plannedWeeklyFor(scheduleForm.draft);
  const scheduleWorkingDayCount = scheduleForm.draft.worksOn.filter(Boolean).length;
  const schedulePerDay = scheduleWorkingDayCount > 0 ? Math.round(schedulePlannedWeekly / scheduleWorkingDayCount) : 0;
  const scheduleBusy = createPeriod.isPending || updatePeriod.isPending;
  const scheduleErrorMessage = scheduleForm.editingId !== null
    ? updatePeriod.error && apiErrorMessage(updatePeriod.error, 'Periode konnte nicht gespeichert werden.')
    : createPeriod.error && apiErrorMessage(createPeriod.error, 'Periode konnte nicht angelegt werden.');

  const sortedHistory = [...periods].sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? 1 : -1));

  return (
    <section className="settings">
      <h2>Einstellungen</h2>

      <details className="card settings-section" id="current-period-card" open>
        <summary>
          <span className="section-title">Pensum</span>
          <span className="section-summary faint">
            {formatDuration(currentPerDay)}/Tag ab {formatIsoDateDMY(currentPeriod.effectiveFrom)}
          </span>
        </summary>
        <div className="section-body">
        <p className="muted small">
          Vollzeitpensum und Prozentsatz eingeben, die tatsächlichen Arbeitstage ankreuzen und
          anwenden. Ein abgewählter Wochentag wird zum freien Tag — er zählt nicht mehr zum Ziel
          und wird nie als nicht erfasst gemeldet. Gilt für die aktuell laufende Periode
          (ab <strong>{formatIsoDateDMY(currentPeriod.effectiveFrom)}</strong>) — Pensumänderungen ab
          einem anderen Datum unten bei „Pensum ab Datum ändern“.
        </p>

        <div className="workload-inputs">
          <label className="labelled">
            <span>Vollzeit-Woche</span>
            <span className="input-with-suffix">
              <input
                type="number" min={0} max={168} step={0.5} inputMode="decimal"
                value={String(currentDraft.fullTimeWeeklyHours)}
                onChange={(e) => applyCurrentWorkloadWith({ fullTimeWeeklyHours: Number(e.target.value) })}
              />
              <span className="faint">Std</span>
            </span>
          </label>

          <label className="labelled">
            <span>Pensum</span>
            <span className="input-with-suffix">
              <input
                type="number" min={0} max={100} step={0.01} inputMode="decimal"
                value={String(currentDraft.workloadPercent)}
                onChange={(e) => applyCurrentWorkloadWith({ workloadPercent: Number(e.target.value) })}
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
                onClick={() => applyCurrentWorkloadWith({ fullTimeWeeklyHours: minutesToHoursValue(preset.weeklyMinutes) })}
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
                checked={currentDraft.worksOn[i] ?? false}
                onChange={(e) => {
                  const worksOn = [...currentDraft.worksOn];
                  worksOn[i] = e.target.checked;
                  applyCurrentWorkloadWith({ worksOn });
                }}
              />
              <span>{WEEKDAY_LABELS[i]}</span>
            </label>
          ))}
        </fieldset>

        <div className="workload-result">
          <span>
            Wochenziel <strong><DurationText minutes={currentPlannedWeekly} /></strong>
            {currentWorkingDayCount > 0 && (
              <> auf {currentWorkingDayCount} {currentWorkingDayCount === 1 ? 'Tag' : 'Tage'} verteilt →{' '}
                <strong>{formatDuration(currentPerDay)}</strong> pro Tag</>
            )}
          </span>
        </div>

        <h3>Stunden pro Wochentag</h3>
        <p className="muted small">
          Was jeder Tag der aktuellen Periode effektiv zählt. Ein Wert kann von Hand angepasst
          werden — das Pensum-Feld oben stimmt dann einfach nicht mehr überein.
        </p>

        <div className="weekday-grid">
          {WEEKDAY_LABELS_LONG.map((label, i) => {
            const minutes = currentDraft.targets[i] ?? 0;
            return (
              <label key={label} className="weekday-row">
                <span className="weekday-name">{label}</span>
                <span className="input-with-suffix">
                  <input
                    type="number" min={0} max={24} step={0.25} inputMode="decimal"
                    value={String(minutesToHoursValue(minutes))}
                    aria-label={`${label} Zielstunden`}
                    onChange={(e) => {
                      const targets = [...currentDraft.targets];
                      targets[i] = hoursToMinutes(Number(e.target.value) || 0);
                      patchCurrent({ targets });
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

        <div className="settings-actions">
          <button type="button" className="primary" onClick={saveCurrent} disabled={updatePeriod.isPending}>
            {updatePeriod.isPending ? 'Speichert…' : 'Einstellungen speichern'}
          </button>
          {currentSaved && <span className="saved-tick">✓ Gespeichert</span>}
          {updatePeriod.error && !currentSaved && (
            <span className="save-error">{apiErrorMessage(updatePeriod.error, 'Konnte nicht gespeichert werden.')}</span>
          )}
          <p className="faint small">
            Ein Pensum gilt nur ab seinem Startdatum bis zur nächsten Periode — eine Änderung
            berechnet nur die davon betroffenen Salden neu, nie die davor liegenden. Auch ein
            rückdatiertes Startdatum ist möglich, um eine bereits laufende Periode nachträglich zu
            korrigieren.
          </p>
        </div>
        </div>
      </details>

      <details className="card settings-section" id="schedule-period-card">
        <summary>
          <span className="section-title">Pensum ab Datum ändern</span>
          <span className="section-summary faint">Neue Periode planen</span>
        </summary>
        <div className="section-body">
        <p className="muted small">
          Neue Periode ab einem Datum anlegen — auch rückwirkend. Zum Bearbeiten oder Löschen
          einer bestehenden Periode unten im Verlauf „Bearbeiten“ wählen.
        </p>

        <label className="labelled">
          <span>Gültig ab</span>
          <input
            type="date"
            value={scheduleForm.effectiveFrom}
            onChange={(e) => setScheduleForm({ ...scheduleForm, effectiveFrom: e.target.value })}
          />
        </label>

        <div className="workload-inputs">
          <label className="labelled">
            <span>Vollzeit-Woche</span>
            <span className="input-with-suffix">
              <input
                type="number" min={0} max={168} step={0.5} inputMode="decimal"
                value={String(scheduleForm.draft.fullTimeWeeklyHours)}
                onChange={(e) => applyScheduleWorkloadWith({ fullTimeWeeklyHours: Number(e.target.value) })}
              />
              <span className="faint">Std</span>
            </span>
          </label>

          <label className="labelled">
            <span>Pensum</span>
            <span className="input-with-suffix">
              <input
                type="number" min={0} max={100} step={0.01} inputMode="decimal"
                value={String(scheduleForm.draft.workloadPercent)}
                onChange={(e) => applyScheduleWorkloadWith({ workloadPercent: Number(e.target.value) })}
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
                onClick={() => applyScheduleWorkloadWith({ fullTimeWeeklyHours: minutesToHoursValue(preset.weeklyMinutes) })}
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
                checked={scheduleForm.draft.worksOn[i] ?? false}
                onChange={(e) => {
                  const worksOn = [...scheduleForm.draft.worksOn];
                  worksOn[i] = e.target.checked;
                  applyScheduleWorkloadWith({ worksOn });
                }}
              />
              <span>{WEEKDAY_LABELS[i]}</span>
            </label>
          ))}
        </fieldset>

        <div className="workload-result">
          <span>
            Wochenziel <strong><DurationText minutes={schedulePlannedWeekly} /></strong>
            {scheduleWorkingDayCount > 0 && (
              <> auf {scheduleWorkingDayCount} {scheduleWorkingDayCount === 1 ? 'Tag' : 'Tage'} verteilt →{' '}
                <strong>{formatDuration(schedulePerDay)}</strong> pro Tag</>
            )}
          </span>
        </div>

        <div className="settings-actions">
          <button type="button" className="primary" onClick={submitScheduleForm} disabled={scheduleBusy}>
            {scheduleBusy ? 'Speichert…' : scheduleForm.editingId !== null ? 'Periode speichern' : 'Periode anlegen'}
          </button>
          {scheduleForm.editingId !== null && (
            <button type="button" className="ghost small" onClick={resetScheduleForm}>Abbrechen</button>
          )}
          {scheduleErrorMessage && <span className="save-error">{scheduleErrorMessage}</span>}
        </div>
        </div>
      </details>

      <details className="card settings-section">
        <summary>
          <span className="section-title">Pensum-Verlauf</span>
          <span className="section-summary faint">{periods.length} {periods.length === 1 ? 'Periode' : 'Perioden'}</span>
        </summary>
        <div className="section-body">
        <div className="period-history">
          {sortedHistory.map((period) => {
            const weekly = period.targetMinutesByWeekday.reduce((a, b) => a + b, 0);
            const workingDays = period.targetMinutesByWeekday.filter((m) => m > 0).length;
            const perDay = workingDays > 0 ? Math.round(weekly / workingDays) : 0;
            const isCurrent = period.id === currentPeriod.id;
            return (
              <div key={period.id} className={isCurrent ? 'period-row is-current' : 'period-row'}>
                <span>
                  ab {formatIsoDateDMY(period.effectiveFrom)}
                  {isCurrent && <span className="chip chip-today">Aktuell</span>}
                </span>
                <span className="faint num">
                  <DurationText minutes={weekly} />
                  {workingDays > 0 && <> · {formatDuration(perDay)}/Tag</>}
                </span>
                <span className="period-actions">
                  <button type="button" className="ghost small" onClick={() => startEditingPeriod(period)}>
                    Bearbeiten
                  </button>
                  <button
                    type="button"
                    className="ghost small danger"
                    disabled={periods.length <= 1 || deletePeriod.isPending}
                    title={periods.length <= 1 ? 'Die letzte verbleibende Periode kann nicht gelöscht werden.' : undefined}
                    onClick={() => deletePeriod.mutate(period.id)}
                  >
                    Löschen
                  </button>
                </span>
              </div>
            );
          })}
        </div>
        {deletePeriod.error && (
          <p className="save-error">{apiErrorMessage(deletePeriod.error, 'Periode konnte nicht gelöscht werden.')}</p>
        )}
        </div>
      </details>

      <details className="card settings-section" id="holiday-template-card">
        <summary>
          <span className="section-title">Feiertage</span>
        </summary>
        <div className="section-body">
          <HolidayTemplateCard />
        </div>
      </details>
    </section>
  );
}
