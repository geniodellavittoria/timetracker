import { Navigate, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import {
  isoWeekKey, isoWeekKeyToRange, isValidIsoWeekKey, isValidMonthKey, monthKey, monthKeyToRange,
  todayIsoDateLocal,
} from '@shared/dates.ts';
import { BalanceBadge } from './components/BalanceBadge.tsx';
import { useTheme } from './hooks/useTheme.ts';
import { LoginPage } from './pages/LoginPage.tsx';
import { MonthPage } from './pages/MonthPage.tsx';
import { RegisterPage } from './pages/RegisterPage.tsx';
import { SettingsPage } from './pages/SettingsPage.tsx';
import { WeekPage } from './pages/WeekPage.tsx';
import { useLogout, useMe, useSummary } from './api/queries.ts';

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/*" element={<AuthGate><AuthenticatedApp /></AuthGate>} />
    </Routes>
  );
}

/** Everything but /login and /register requires a session; unauthenticated visitors are sent to /login. */
function AuthGate({ children }: { children: React.ReactNode }) {
  const { data: user, isLoading } = useMe();
  if (isLoading) return null;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function AuthenticatedApp() {
  const today = todayIsoDateLocal();
  const { data: user } = useMe();
  const logout = useLogout();

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
        <div className="header-account">
          {user && <span className="faint small">{user.email}</span>}
          <ThemeToggle />
          <button type="button" className="ghost small" onClick={() => logout.mutate()} disabled={logout.isPending}>
            Abmelden
          </button>
        </div>
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

function ThemeToggle() {
  const [theme, setTheme] = useTheme();
  return (
    <div className="theme-toggle" role="group" aria-label="Farbschema">
      <button
        type="button"
        className={theme === 'light' ? 'ghost small is-active' : 'ghost small'}
        aria-pressed={theme === 'light'}
        title="Helles Farbschema"
        onClick={() => setTheme('light')}
      >
        ☀️<span className="visually-hidden">Hell</span>
      </button>
      <button
        type="button"
        className={theme === 'dark' ? 'ghost small is-active' : 'ghost small'}
        aria-pressed={theme === 'dark'}
        title="Dunkles Farbschema"
        onClick={() => setTheme('dark')}
      >
        🌙<span className="visually-hidden">Dunkel</span>
      </button>
    </div>
  );
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
