import { Hono } from 'hono';
import type { Context } from 'hono';
import { isValidIsoDate } from '@shared/dates.ts';
import { summarizeVacation, vacationYearRange } from '@shared/vacation.ts';
import { vacationAllowanceInputSchema, vacationYearSchema, zodIssues } from '@shared/validation.ts';
import type { HonoEnv } from '../env.ts';
import { notFound, validationError } from '../errors.ts';
import { listEntries } from '../repo/entries.ts';
import { listSettingsPeriods } from '../repo/settings.ts';
import { deleteAllowance, getAllowance, listAllowances, upsertAllowance } from '../repo/vacation.ts';

export const vacationRoutes = new Hono<HonoEnv>();

function parseYear(c: Context<HonoEnv>, raw: string | undefined) {
  const parsed = vacationYearSchema.safeParse(raw);
  if (parsed.success) return { year: parsed.data } as const;
  return {
    error: validationError(c, [
      { path: 'year', code: 'invalid_range', message: '`year` muss ein gültiges Jahr sein (z. B. 2026 für 2026/27).' },
    ]),
  } as const;
}

vacationRoutes.get('/allowances', async (c) => c.json({ allowances: await listAllowances(c.env.DB, c.get('userId')) }));

vacationRoutes.put('/allowances/:year', async (c) => {
  const { year, error } = parseYear(c, c.req.param('year'));
  if (error) return error;

  const raw = await c.req.json().catch(() => null);
  const parsed = vacationAllowanceInputSchema.safeParse(raw);
  if (!parsed.success) return validationError(c, zodIssues(parsed.error));

  return c.json(await upsertAllowance(c.env.DB, c.get('userId'), year, parsed.data));
});

vacationRoutes.delete('/allowances/:year', async (c) => {
  const { year, error } = parseYear(c, c.req.param('year'));
  if (error) return error;
  return (await deleteAllowance(c.env.DB, c.get('userId'), year))
    ? c.body(null, 204)
    : notFound(c, 'Für dieses Jahr ist kein Ferienanspruch erfasst.');
});

vacationRoutes.get('/summary', async (c) => {
  const { year, error } = parseYear(c, c.req.query('year'));
  if (error) return error;

  // Browser-supplied for the same reason as in routes/summary.ts.
  const todayParam = c.req.query('today');
  if (todayParam !== undefined && !isValidIsoDate(todayParam)) {
    return validationError(c, [
      { path: 'today', code: 'invalid_date', message: '`today` muss ein gültiges Datum (JJJJ-MM-TT) sein.' },
    ]);
  }
  const today = todayParam ?? new Date().toISOString().slice(0, 10);

  const userId = c.get('userId');
  const { from, to } = vacationYearRange(year);
  const [settings, allowance, entries] = await Promise.all([
    listSettingsPeriods(c.env.DB, userId),
    getAllowance(c.env.DB, userId, year),
    listEntries(c.env.DB, userId, from, to),
  ]);

  return c.json(summarizeVacation({ year, allowance, entries, settings, today }));
});
