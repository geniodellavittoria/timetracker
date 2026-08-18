import { Hono } from 'hono';
import { isValidIsoDate } from '@shared/dates.ts';
import { entryInputSchema, validateEntryInput, validateRange, zodIssues } from '@shared/validation.ts';
import type { TimeEntryInput } from '@shared/types.ts';
import type { HonoEnv } from '../env.ts';
import { notFound, validationError } from '../errors.ts';
import { deleteEntry, getEntry, listEntries, upsertEntry } from '../repo/entries.ts';

export const entriesRoutes = new Hono<HonoEnv>();

entriesRoutes.get('/', async (c) => {
  const from = c.req.query('from');
  const to = c.req.query('to');
  const issues = validateRange(from, to);
  if (issues.length) return validationError(c, issues);

  return c.json({ entries: await listEntries(c.env.DB, from!, to!) });
});

entriesRoutes.get('/:date', async (c) => {
  const date = c.req.param('date');
  if (!isValidIsoDate(date)) {
    return validationError(c, [
      { path: 'date', code: 'invalid_date', message: 'Kein gültiges Datum (JJJJ-MM-TT).' },
    ]);
  }
  const entry = await getEntry(c.env.DB, date);
  return entry ? c.json(entry) : notFound(c, `Kein Eintrag für ${date}.`);
});

entriesRoutes.put('/:date', async (c) => {
  const date = c.req.param('date');
  if (!isValidIsoDate(date)) {
    return validationError(c, [
      { path: 'date', code: 'invalid_date', message: 'Kein gültiges Datum (JJJJ-MM-TT).' },
    ]);
  }

  const raw = await c.req.json().catch(() => null);
  // strictObject: a `date` key in the body is rejected — the URL is authoritative.
  const parsed = entryInputSchema.safeParse(raw);
  if (!parsed.success) return validationError(c, zodIssues(parsed.error));

  const input = parsed.data as TimeEntryInput;
  const issues = validateEntryInput(input);
  if (issues.length) return validationError(c, issues);

  const { entry, created } = await upsertEntry(c.env.DB, date, input);
  return c.json(entry, created ? 201 : 200);
});

entriesRoutes.delete('/:date', async (c) => {
  const date = c.req.param('date');
  if (!isValidIsoDate(date)) {
    return validationError(c, [
      { path: 'date', code: 'invalid_date', message: 'Kein gültiges Datum (JJJJ-MM-TT).' },
    ]);
  }
  const deleted = await deleteEntry(c.env.DB, date);
  return deleted ? c.body(null, 204) : notFound(c, `Kein Eintrag für ${date}.`);
});
