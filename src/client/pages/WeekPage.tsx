import { useNavigate, useParams } from 'react-router-dom';
import {
  addWeeks, formatWeekLabel, isoWeekKey, isoWeekKeyToRange, isValidIsoWeekKey, todayIsoDateLocal,
} from '@shared/dates.ts';
import { DayRow } from '../components/DayRow.tsx';
import { PeriodNav } from '../components/PeriodNav.tsx';
import { TotalsBar } from '../components/TotalsBar.tsx';
import { useDeleteEntry, useSettings, useSummary, useUpsertEntry } from '../api/queries.ts';

export function WeekPage() {
  const { weekKey = '' } = useParams();
  const navigate = useNavigate();
  const today = todayIsoDateLocal();

  if (!isValidIsoWeekKey(weekKey)) {
    return <p className="error-banner">„{weekKey}“ ist keine gültige Woche.</p>;
  }

  const { from, to } = isoWeekKeyToRange(weekKey);
  const settingsQuery = useSettings();
  const summaryQuery = useSummary({ from, to, groupBy: 'none', today });
  const upsert = useUpsertEntry();
  const remove = useDeleteEntry();

  const settings = settingsQuery.data;
  const summary = summaryQuery.data;

  return (
    <section>
      <PeriodNav
        label={formatWeekLabel(weekKey)}
        onPrev={() => navigate(`/weeks/${addWeeks(weekKey, -1)}`)}
        onNext={() => navigate(`/weeks/${addWeeks(weekKey, 1)}`)}
        onToday={() => navigate(`/weeks/${isoWeekKey(today)}`)}
        onJump={(date) => navigate(`/weeks/${isoWeekKey(date)}`)}
      />

      {(settingsQuery.error || summaryQuery.error) && (
        <p className="error-banner">Diese Woche konnte nicht geladen werden. Verbindung prüfen und neu laden.</p>
      )}

      <div className="card day-list">
        {!settings || !summary ? (
          <p className="muted loading-note">Lädt…</p>
        ) : (
          summary.days.map((day) => (
            <DayRow
              key={day.date}
              day={day}
              settings={settings}
              isToday={day.date === today}
              onSave={(input) => upsert.mutateAsync({ date: day.date, input })}
              onDelete={() => remove.mutateAsync(day.date)}
            />
          ))
        )}
      </div>

      {summary && <TotalsBar totals={summary.totals} />}
    </section>
  );
}
