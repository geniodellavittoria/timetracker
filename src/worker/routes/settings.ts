import { Hono } from 'hono';
import { settingsInputSchema, zodIssues } from '@shared/validation.ts';
import type { ByWeekday, SettingsInput } from '@shared/types.ts';
import type { HonoEnv } from '../env.ts';
import { validationError } from '../errors.ts';
import { getSettings, updateSettings } from '../repo/settings.ts';

export const settingsRoutes = new Hono<HonoEnv>();

settingsRoutes.get('/', async (c) => c.json(await getSettings(c.env.DB)));

settingsRoutes.put('/', async (c) => {
  const raw = await c.req.json().catch(() => null);
  const parsed = settingsInputSchema.safeParse(raw);
  if (!parsed.success) return validationError(c, zodIssues(parsed.error));

  const input: SettingsInput = {
    ...parsed.data,
    targetMinutesByWeekday: parsed.data.targetMinutesByWeekday as unknown as ByWeekday<number>,
  };
  return c.json(await updateSettings(c.env.DB, input));
});
