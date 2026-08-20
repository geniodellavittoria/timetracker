import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  addMonths, formatDayMonth, formatMonthLabel, isValidMonthKey, monthKey, monthKeyToRange,
  todayIsoDateLocal, WEEKDAY_LABELS,
} from '@shared/dates.ts';
import { dayTypeLabel } from '../components/DayTypeSelect.tsx';
import { DurationText } from '../components/DurationText.tsx';
import { PeriodNav } from '../components/PeriodNav.tsx';
import { TotalsBar } from '../components/TotalsBar.tsx';
import { useSummary } from '../api/queries.ts';
import type { DaySummary } from '@shared/types.ts';

export function MonthPage() {
  const { monthKey: key = '' } = useParams();
  const navigate = useNavigate();
  const today = todayIsoDateLocal();

  if (!isValidMonthKey(key)) {
    return <p className="error-banner">„{key}“ ist kein gültiger Monat.</p>;
  }

  const { from, to } = monthKeyToRange(key);
  const { data: summary, error } = useSummary({ from, to, groupBy: 'week', today });

  return (
    <section>
      <PeriodNav
        label={formatMonthLabel(key)}
        onPrev={() => navigate(`/months/${addMonths(key, -1)}`)}
        onNext={() => navigate(`/months/${addMonths(key, 1)}`)}
        onToday={() => navigate(`/months/${monthKey(today)}`)}
        onJump={(date) => navigate(`/months/${monthKey(date)}`)}
      />

      {error && <p className="error-banner">Dieser Monat konnte nicht geladen werden.</p>}
      {!summary ? (
        <p className="muted loading-note">Lädt…</p>
      ) : (
        <>
          <TotalsBar totals={summary.totals} />

          <p className="muted small breakdown">
            {(['normal', 'vacation', 'sick', 'holiday'] as const)
              .map((t) => `${dayTypeLabel(t)} ${summary.totals.dayTypeCounts[t]}`)
              .join(' · ')}
          </p>

          {summary.buckets.map((bucket) => (
            <details key={bucket.key} className="card week-bucket" open>
              <summary>
                <span className="bucket-title">
                  <Link to={`/weeks/${bucket.key}`} onClick={(e) => e.stopPropagation()}>
                    {bucket.label}
                  </Link>
                </span>
                <span className="bucket-figures">
                  <DurationText minutes={bucket.totals.workedMinutes} />
                  <span className="faint">/</span>
                  <DurationText minutes={bucket.totals.targetMinutesScheduled} />
                  <DurationText minutes={bucket.totals.balanceMinutes} signed colored />
                </span>
              </summary>
              <div className="bucket-days">
                {bucket.days.map((day) => <MonthDayLine key={day.date} day={day} today={today} />)}
              </div>
            </details>
          ))}
        </>
      )}
    </section>
  );
}

function MonthDayLine({ day, today }: { day: DaySummary; today: string }) {
  const isDayOff = day.targetMinutes === 0;
  return (
    <div className={`month-day ${day.date === today ? 'is-today' : ''} ${isDayOff ? 'is-day-off' : ''}`}>
      <span className="month-day-label">
        {WEEKDAY_LABELS[day.weekday]} {formatDayMonth(day.date)}
      </span>
      <span className="month-day-type muted small">
        {day.dayType && day.dayType !== 'normal'
          ? dayTypeLabel(day.dayType)
          : isDayOff && !day.hasEntry ? 'Frei'
          : day.isMissingWorkday ? 'nicht erfasst' : ''}
      </span>
      <DurationText minutes={day.hasEntry ? day.workedMinutes : null} />
      <DurationText minutes={day.hasEntry ? day.balanceMinutes : null} signed colored />
    </div>
  );
}
