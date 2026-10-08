import { Hono, type Context } from 'hono';
import { buildRangeSummary, buildYearComparison, cumulativeBalance } from '@shared/calc.ts';
import { isValidIsoDate } from '@shared/dates.ts';
import { groupBySchema, validateRange } from '@shared/validation.ts';
import type { HonoEnv } from '../env.ts';
import { validationError } from '../errors.ts';
import { listEntries, listEntriesUpTo } from '../repo/entries.ts';
import { listSettingsPeriods } from '../repo/settings.ts';

export const summaryRoutes = new Hono<HonoEnv>();

/*
 * `today` comes from the browser. Workers run in UTC, so deriving it here
 * would call an entry made at 01:00 in Zurich "tomorrow" and flag the real
 * today as an untracked workday. The UTC fallback only applies to callers
 * (curl, tests) that omit the parameter. `null` means it was given but invalid.
 */
function todayFrom(c: Context<HonoEnv>): string | null {
  const todayParam = c.req.query('today');
  if (todayParam === undefined) return new Date().toISOString().slice(0, 10);
  return isValidIsoDate(todayParam) ? todayParam : null;
}

function invalidToday(c: Context<HonoEnv>) {
  return validationError(c, [
    { path: 'today', code: 'invalid_date', message: '`today` muss ein gültiges Datum (JJJJ-MM-TT) sein.' },
  ]);
}

summaryRoutes.get('/', async (c) => {
  const from = c.req.query('from');
  const to = c.req.query('to');
  const rangeIssues = validateRange(from, to);
  if (rangeIssues.length) return validationError(c, rangeIssues);

  const groupBy = groupBySchema.safeParse(c.req.query('groupBy') ?? 'none');
  if (!groupBy.success) {
    return validationError(c, [
      { path: 'groupBy', code: 'invalid_range', message: '`groupBy` muss week, month oder none sein.' },
    ]);
  }

  const today = todayFrom(c);
  if (today === null) return invalidToday(c);

  const userId = c.get('userId');
  const settings = await listSettingsPeriods(c.env.DB, userId);
  const [entries, allEntriesUpTo] = await Promise.all([
    listEntries(c.env.DB, userId, from!, to!),
    listEntriesUpTo(c.env.DB, userId, to!),
  ]);

  return c.json(
    buildRangeSummary({
      from: from!,
      to: to!,
      entries,
      settings,
      today,
      groupBy: groupBy.data,
      // Same balance function as every other total — never reimplemented in SQL.
      cumulativeBalanceMinutes: cumulativeBalance(allEntriesUpTo, settings),
    }),
  );
});

/** Worked time per ISO week for every year with entries, for the year comparison page. */
summaryRoutes.get('/years', async (c) => {
  const today = todayFrom(c);
  if (today === null) return invalidToday(c);

  const userId = c.get('userId');
  const [settings, entries] = await Promise.all([
    listSettingsPeriods(c.env.DB, userId),
    listEntriesUpTo(c.env.DB, userId, today),
  ]);

  return c.json(buildYearComparison({ entries, settings, today }));
});
