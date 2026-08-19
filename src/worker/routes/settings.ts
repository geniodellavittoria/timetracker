import { Hono } from 'hono';
import type { Context } from 'hono';
import { settingsPeriodInputSchema, zodIssues } from '@shared/validation.ts';
import type { ByWeekday, SettingsPeriodInput } from '@shared/types.ts';
import type { HonoEnv } from '../env.ts';
import { errorBody, notFound, validationError } from '../errors.ts';
import { createSettingsPeriod, deleteSettingsPeriod, listSettingsPeriods, updateSettingsPeriod } from '../repo/settings.ts';

export const settingsRoutes = new Hono<HonoEnv>();

settingsRoutes.get('/', async (c) => c.json({ periods: await listSettingsPeriods(c.env.DB, c.get('userId')) }));

function parseInput(raw: unknown) {
  const parsed = settingsPeriodInputSchema.safeParse(raw);
  if (!parsed.success) return { issues: zodIssues(parsed.error) } as const;
  const input: SettingsPeriodInput = {
    ...parsed.data,
    targetMinutesByWeekday: parsed.data.targetMinutesByWeekday as unknown as ByWeekday<number>,
  };
  return { input } as const;
}

const effectiveDateTakenError = (c: Context<HonoEnv>) => c.json(
  errorBody('validation_error', 'Für dieses Datum besteht bereits eine Pensum-Periode.',
    [{ path: 'effectiveFrom', code: 'effective_date_taken', message: 'Für dieses Datum besteht bereits eine Pensum-Periode.' }]),
  409,
);

settingsRoutes.post('/periods', async (c) => {
  const raw = await c.req.json().catch(() => null);
  const { input, issues } = parseInput(raw);
  if (issues) return validationError(c, issues);

  try {
    return c.json(await createSettingsPeriod(c.env.DB, c.get('userId'), input), 201);
  } catch (err) {
    if (err instanceof Error && /UNIQUE constraint failed/i.test(err.message)) return effectiveDateTakenError(c);
    throw err;
  }
});

settingsRoutes.put('/periods/:id', async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id)) return notFound(c, 'Keine solche Pensum-Periode.');

  const raw = await c.req.json().catch(() => null);
  const { input, issues } = parseInput(raw);
  if (issues) return validationError(c, issues);

  try {
    const updated = await updateSettingsPeriod(c.env.DB, c.get('userId'), id, input);
    return updated ? c.json(updated) : notFound(c, 'Keine solche Pensum-Periode.');
  } catch (err) {
    if (err instanceof Error && /UNIQUE constraint failed/i.test(err.message)) return effectiveDateTakenError(c);
    throw err;
  }
});

settingsRoutes.delete('/periods/:id', async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id)) return notFound(c, 'Keine solche Pensum-Periode.');

  const result = await deleteSettingsPeriod(c.env.DB, c.get('userId'), id);
  if (result === 'deleted') return c.body(null, 204);
  if (result === 'not_found') return notFound(c, 'Keine solche Pensum-Periode.');
  return c.json(
    errorBody('validation_error', 'Die letzte verbleibende Pensum-Periode kann nicht gelöscht werden.',
      [{ path: 'id', code: 'last_period', message: 'Die letzte verbleibende Pensum-Periode kann nicht gelöscht werden.' }]),
    409,
  );
});
