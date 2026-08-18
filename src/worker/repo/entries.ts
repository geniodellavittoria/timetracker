import { formatTimeOfDay, parseTimeOfDay } from '@shared/time.ts';
import type { IsoDate, TimeEntry, TimeEntryInput } from '@shared/types.ts';

interface EntryRow {
  date: string;
  day_type: string;
  arrival_minutes: number | null;
  leave_minutes: number | null;
  break_minutes: number | null;
  note: string | null;
  updated_at: string;
}

/** The single place rows become domain objects, so the minutes/'HH:MM' seam is one-way. */
function toDomain(row: EntryRow): TimeEntry {
  return {
    date: row.date,
    dayType: row.day_type as TimeEntry['dayType'],
    arrival: row.arrival_minutes === null ? null : formatTimeOfDay(row.arrival_minutes),
    leave: row.leave_minutes === null ? null : formatTimeOfDay(row.leave_minutes),
    breakMinutes: row.break_minutes,
    note: row.note,
    updatedAt: row.updated_at,
  };
}

const COLUMNS = 'date, day_type, arrival_minutes, leave_minutes, break_minutes, note, updated_at';

export async function listEntries(db: D1Database, from: IsoDate, to: IsoDate): Promise<TimeEntry[]> {
  const { results } = await db
    .prepare(`SELECT ${COLUMNS} FROM entries WHERE date BETWEEN ?1 AND ?2 ORDER BY date ASC`)
    .bind(from, to)
    .all<EntryRow>();
  return results.map(toDomain);
}

/** Every entry up to and including `to` — the basis for the cumulative balance. */
export async function listEntriesUpTo(db: D1Database, to: IsoDate): Promise<TimeEntry[]> {
  const { results } = await db
    .prepare(`SELECT ${COLUMNS} FROM entries WHERE date <= ?1 ORDER BY date ASC`)
    .bind(to)
    .all<EntryRow>();
  return results.map(toDomain);
}

export async function getEntry(db: D1Database, date: IsoDate): Promise<TimeEntry | null> {
  const row = await db
    .prepare(`SELECT ${COLUMNS} FROM entries WHERE date = ?1`)
    .bind(date)
    .first<EntryRow>();
  return row ? toDomain(row) : null;
}

export async function upsertEntry(
  db: D1Database,
  date: IsoDate,
  input: TimeEntryInput,
): Promise<{ entry: TimeEntry; created: boolean }> {
  const existing = await getEntry(db, date);

  // Special days never carry times, whatever the client sent.
  const isNormal = input.dayType === 'normal';
  const arrival = isNormal ? parseTimeOfDay(input.arrival) : null;
  const leave = isNormal ? parseTimeOfDay(input.leave) : null;
  const breakMinutes = isNormal ? (input.breakMinutes ?? 0) : null;

  await db
    .prepare(
      `INSERT INTO entries (date, day_type, arrival_minutes, leave_minutes, break_minutes, note, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, strftime('%Y-%m-%dT%H:%M:%SZ','now'))
       ON CONFLICT(date) DO UPDATE SET
         day_type        = excluded.day_type,
         arrival_minutes = excluded.arrival_minutes,
         leave_minutes   = excluded.leave_minutes,
         break_minutes   = excluded.break_minutes,
         note            = excluded.note,
         updated_at      = excluded.updated_at`,
    )
    .bind(date, input.dayType, arrival, leave, breakMinutes, input.note ?? null)
    .run();

  const entry = await getEntry(db, date);
  if (!entry) throw new Error(`Upsert of ${date} did not persist`);
  return { entry, created: existing === null };
}

export async function deleteEntry(db: D1Database, date: IsoDate): Promise<boolean> {
  const result = await db.prepare('DELETE FROM entries WHERE date = ?1').bind(date).run();
  return (result.meta.changes ?? 0) > 0;
}
