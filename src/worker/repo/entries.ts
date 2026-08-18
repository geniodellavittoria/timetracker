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

const COLUMNS = 'date, day_type, arrival_minutes, leave_minutes, break_minutes, note, updated_at';

/**
 * One row per block (normal days) or one lone row (special days) comes back
 * from SQL; this is the single place they get folded into one `TimeEntry`
 * per date. Rows must already be ordered by date, then by arrival, for the
 * blocks to come out in a sane order.
 */
function groupRows(rows: EntryRow[]): TimeEntry[] {
  const order: string[] = [];
  const byDate = new Map<string, TimeEntry>();

  for (const row of rows) {
    let entry = byDate.get(row.date);
    if (!entry) {
      entry = {
        date: row.date,
        dayType: row.day_type as TimeEntry['dayType'],
        blocks: [],
        note: row.note,
        updatedAt: row.updated_at,
      };
      byDate.set(row.date, entry);
      order.push(row.date);
    }
    if (row.arrival_minutes !== null && row.leave_minutes !== null) {
      entry.blocks.push({
        arrival: formatTimeOfDay(row.arrival_minutes),
        leave: formatTimeOfDay(row.leave_minutes),
        breakMinutes: row.break_minutes ?? 0,
      });
    }
  }

  return order.map((date) => byDate.get(date)!);
}

export async function listEntries(db: D1Database, userId: number, from: IsoDate, to: IsoDate): Promise<TimeEntry[]> {
  const { results } = await db
    .prepare(`SELECT ${COLUMNS} FROM entries WHERE user_id = ?1 AND date BETWEEN ?2 AND ?3 ORDER BY date ASC, arrival_minutes ASC`)
    .bind(userId, from, to)
    .all<EntryRow>();
  return groupRows(results);
}

/** Every entry up to and including `to` — the basis for the cumulative balance. */
export async function listEntriesUpTo(db: D1Database, userId: number, to: IsoDate): Promise<TimeEntry[]> {
  const { results } = await db
    .prepare(`SELECT ${COLUMNS} FROM entries WHERE user_id = ?1 AND date <= ?2 ORDER BY date ASC, arrival_minutes ASC`)
    .bind(userId, to)
    .all<EntryRow>();
  return groupRows(results);
}

export async function getEntry(db: D1Database, userId: number, date: IsoDate): Promise<TimeEntry | null> {
  const { results } = await db
    .prepare(`SELECT ${COLUMNS} FROM entries WHERE user_id = ?1 AND date = ?2 ORDER BY arrival_minutes ASC`)
    .bind(userId, date)
    .all<EntryRow>();
  return results.length === 0 ? null : groupRows(results)[0]!;
}

/**
 * Replaces the whole day in one atomic batch — delete whatever rows exist
 * for this date, then insert the new set (one row per block on a normal
 * day, one row with no times on a special day). A day is no longer
 * guaranteed exactly one row (a normal day can carry several blocks), so
 * there's no single-row `ON CONFLICT` target to upsert against; replacing
 * the day wholesale is both simpler and matches how the client already
 * saves — one PUT per day, never a per-block call.
 */
export async function upsertEntry(
  db: D1Database,
  userId: number,
  date: IsoDate,
  input: TimeEntryInput,
): Promise<{ entry: TimeEntry; created: boolean }> {
  const existing = await getEntry(db, userId, date);

  const statements = [db.prepare('DELETE FROM entries WHERE user_id = ?1 AND date = ?2').bind(userId, date)];

  if (input.dayType === 'normal') {
    for (const block of input.blocks) {
      statements.push(
        db
          .prepare(
            `INSERT INTO entries (user_id, date, day_type, arrival_minutes, leave_minutes, break_minutes, note, updated_at)
             VALUES (?1, ?2, 'normal', ?3, ?4, ?5, ?6, strftime('%Y-%m-%dT%H:%M:%SZ','now'))`,
          )
          .bind(userId, date, parseTimeOfDay(block.arrival), parseTimeOfDay(block.leave), block.breakMinutes, input.note ?? null),
      );
    }
  } else {
    statements.push(
      db
        .prepare(
          `INSERT INTO entries (user_id, date, day_type, note, updated_at)
           VALUES (?1, ?2, ?3, ?4, strftime('%Y-%m-%dT%H:%M:%SZ','now'))`,
        )
        .bind(userId, date, input.dayType, input.note ?? null),
    );
  }

  await db.batch(statements);

  const entry = await getEntry(db, userId, date);
  if (!entry) throw new Error(`Upsert of ${date} did not persist`);
  return { entry, created: existing === null };
}

export async function deleteEntry(db: D1Database, userId: number, date: IsoDate): Promise<boolean> {
  const result = await db.prepare('DELETE FROM entries WHERE user_id = ?1 AND date = ?2').bind(userId, date).run();
  return (result.meta.changes ?? 0) > 0;
}
