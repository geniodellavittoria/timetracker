import { Navigate, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import {
  isoWeekKey, isoWeekKeyToRange, isValidIsoWeekKey, isValidMonthKey, monthKey, monthKeyToRange,
  todayIsoDateLocal,
} from '@shared/dates.ts';
import { BalanceBadge } from './components/BalanceBadge.tsx';
import { MonthPage } from './pages/MonthPage.tsx';
import { SettingsPage } from './pages/SettingsPage.tsx';
import { WeekPage } from './pages/WeekPage.tsx';
import { useSummary } from './api/queries.ts';

export function App() {
  const today = todayIsoDateLocal();

  return (
    <>
      <header className="header">
        <h1>⏱ Zeiterfassung</h1>
        <nav>
          <NavLink to={`/weeks/${isoWeekKey(today)}`}>Woche</NavLink>
          <NavLink to={`/months/${monthKey(today)}`}>Monat</NavLink>
          <NavLink to="/settings">Einstellungen</NavLink>
        </nav>
        <span className="spacer" />
        <CumulativeBalance />
      </header>

      <main className="app">
        <Routes>
          <Route path="/" element={<Navigate to={`/weeks/${isoWeekKey(today)}`} replace />} />
          <Route path="/weeks/:weekKey" element={<WeekPage />} />
          <Route path="/months/:monthKey" element={<MonthPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
    </>
  );
}

/**
 * Reads the balance off the range the current page is already showing, so it
 * shares that page's cache entry instead of issuing a request of its own.
 */
function CumulativeBalance() {
  const today = todayIsoDateLocal();
  const { pathname } = useLocation();

  const weekMatch = /^\/weeks\/(.+)$/.exec(pathname)?.[1];
  const monthMatch = /^\/months\/(.+)$/.exec(pathname)?.[1];

  let range = isoWeekKeyToRange(isoWeekKey(today));
  let groupBy: 'none' | 'week' = 'none';
  if (weekMatch && isValidIsoWeekKey(weekMatch)) {
    range = isoWeekKeyToRange(weekMatch);
  } else if (monthMatch && isValidMonthKey(monthMatch)) {
    range = monthKeyToRange(monthMatch);
    groupBy = 'week';
  }

  const { data, isLoading } = useSummary({ ...range, groupBy, today });
  return <BalanceBadge minutes={data?.cumulativeBalanceMinutes ?? null} loading={isLoading} />;
}

function NotFound() {
  const today = todayIsoDateLocal();
  return (
    <section>
      <h2>Seite nicht gefunden</h2>
      <p className="muted">
        <NavLink to={`/weeks/${isoWeekKey(today)}`}>Zur aktuellen Woche</NavLink>
      </p>
    </section>
  );
}
