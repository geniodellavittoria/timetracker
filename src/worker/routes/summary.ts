import { Hono } from 'hono';
import { buildRangeSummary, cumulativeBalance } from '@shared/calc.ts';
import { isValidIsoDate } from '@shared/dates.ts';
import { groupBySchema, validateRange } from '@shared/validation.ts';
import type { HonoEnv } from '../env.ts';
import { validationError } from '../errors.ts';
import { listEntries, listEntriesUpTo } from '../repo/entries.ts';
import { getSettings } from '../repo/settings.ts';

export const summaryRoutes = new Hono<HonoEnv>();

summaryRoutes.get('/', async (c) => {
  const from = c.req.query('from');
  const to = c.req.query('to');
  const rangeIssues = validateRange(from, to);
  if (rangeIssues.length) return validationError(c, rangeIssues);

  const groupBy = groupBySchema.safeParse(c.req.query('groupBy') ?? 'none');
  if (!groupBy.success) {
    return validationError(c, [
      { path: 'groupBy', code: 'invalid_range', message: 'groupBy must be week, month or none.' },
    ]);
  }

  /*
   * `today` comes from the browser. Workers run in UTC, so deriving it here
   * would call an entry made at 01:00 in Zurich "tomorrow" and flag the real
   * today as an untracked workday. The UTC fallback only applies to callers
   * (curl, tests) that omit the parameter.
   */
  const todayParam = c.req.query('today');
  if (todayParam !== undefined && !isValidIsoDate(todayParam)) {
    return validationError(c, [
      { path: 'today', code: 'invalid_date', message: '`today` must be a YYYY-MM-DD date.' },
    ]);
  }
  const today = todayParam ?? new Date().toISOString().slice(0, 10);

  const settings = await getSettings(c.env.DB);
  const [entries, allEntriesUpTo] = await Promise.all([
    listEntries(c.env.DB, from!, to!),
    listEntriesUpTo(c.env.DB, to!),
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
