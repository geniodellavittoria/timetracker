import { mostRecentAugustFirst } from '@shared/dates.ts';
import type { ByWeekday, IsoDate, SettingsPeriod, SettingsPeriodInput } from '@shared/types.ts';

interface SettingsRow {
  id: number;
  effective_from: string;
  full_time_weekly_minutes: number;
  workload_percent_x100: number;
  target_minutes_mon: number;
  target_minutes_tue: number;
  target_minutes_wed: number;
  target_minutes_thu: number;
  target_minutes_fri: number;
  target_minutes_sat: number;
  target_minutes_sun: number;
  updated_at: string;
}

const COLUMNS = `id, effective_from, full_time_weekly_minutes, workload_percent_x100,
  target_minutes_mon, target_minutes_tue, target_minutes_wed, target_minutes_thu,
  target_minutes_fri, target_minutes_sat, target_minutes_sun, updated_at`;

function toDomain(row: SettingsRow): SettingsPeriod {
  return {
    id: row.id,
    effectiveFrom: row.effective_from,
    targetMinutesByWeekday: [
      row.target_minutes_mon,
      row.target_minutes_tue,
      row.target_minutes_wed,
      row.target_minutes_thu,
      row.target_minutes_fri,
      row.target_minutes_sat,
      row.target_minutes_sun,
    ] as ByWeekday<number>,
    fullTimeWeeklyMinutes: row.full_time_weekly_minutes,
    workloadPercentX100: row.workload_percent_x100,
    updatedAt: row.updated_at,
  };
}

/** Every period for a user, sorted ascending by `effectiveFrom` — the order `periodFor` in `calc.ts` relies on. */
export async function listSettingsPeriods(db: D1Database, userId: number): Promise<SettingsPeriod[]> {
  const { results } = await db
    .prepare(`SELECT ${COLUMNS} FROM settings WHERE user_id = ?1 ORDER BY effective_from ASC`)
    .bind(userId)
    .all<SettingsRow>();
  return results.map(toDomain);
}

export async function getSettingsPeriod(db: D1Database, userId: number, id: number): Promise<SettingsPeriod | null> {
  const row = await db
    .prepare(`SELECT ${COLUMNS} FROM settings WHERE user_id = ?1 AND id = ?2`)
    .bind(userId, id)
    .first<SettingsRow>();
  return row ? toDomain(row) : null;
}

export async function createSettingsPeriod(
  db: D1Database,
  userId: number,
  input: SettingsPeriodInput,
): Promise<SettingsPeriod> {
  const [mon, tue, wed, thu, fri, sat, sun] = input.targetMinutesByWeekday;
  const row = await db
    .prepare(
      `INSERT INTO settings (user_id, effective_from, full_time_weekly_minutes, workload_percent_x100,
         target_minutes_mon, target_minutes_tue, target_minutes_wed, target_minutes_thu,
         target_minutes_fri, target_minutes_sat, target_minutes_sun)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
       RETURNING ${COLUMNS}`,
    )
    .bind(userId, input.effectiveFrom, input.fullTimeWeeklyMinutes, input.workloadPercentX100, mon, tue, wed, thu, fri, sat, sun)
    .first<SettingsRow>();
  if (!row) throw new Error('Insert of a new settings period did not return a row');
  return toDomain(row);
}

/** `null` if no such period exists for this user (already deleted, wrong id, or another user's). */
export async function updateSettingsPeriod(
  db: D1Database,
  userId: number,
  id: number,
  input: SettingsPeriodInput,
): Promise<SettingsPeriod | null> {
  const [mon, tue, wed, thu, fri, sat, sun] = input.targetMinutesByWeekday;
  const row = await db
    .prepare(
      `UPDATE settings SET
         effective_from           = ?1,
         full_time_weekly_minutes = ?2,
         workload_percent_x100    = ?3,
         target_minutes_mon = ?4, target_minutes_tue = ?5, target_minutes_wed = ?6,
         target_minutes_thu = ?7, target_minutes_fri = ?8, target_minutes_sat = ?9,
         target_minutes_sun = ?10,
         updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now')
       WHERE user_id = ?11 AND id = ?12
       RETURNING ${COLUMNS}`,
    )
    .bind(input.effectiveFrom, input.fullTimeWeeklyMinutes, input.workloadPercentX100, mon, tue, wed, thu, fri, sat, sun, userId, id)
    .first<SettingsRow>();
  return row ? toDomain(row) : null;
}

export type DeleteSettingsPeriodResult = 'deleted' | 'not_found' | 'last_period';

/** Refuses to delete a user's last remaining period — every user must always have at least one. */
export async function deleteSettingsPeriod(db: D1Database, userId: number, id: number): Promise<DeleteSettingsPeriodResult> {
  const { count } = (await db.prepare('SELECT COUNT(*) AS count FROM settings WHERE user_id = ?1').bind(userId).first<{ count: number }>())!;
  if (count <= 1) {
    const exists = await getSettingsPeriod(db, userId, id);
    return exists ? 'last_period' : 'not_found';
  }
  const result = await db.prepare('DELETE FROM settings WHERE user_id = ?1 AND id = ?2').bind(userId, id).run();
  return (result.meta.changes ?? 0) > 0 ? 'deleted' : 'not_found';
}

/**
 * A 42h/100% week, Mon–Fri, Sat/Sun off — the same defaults `0001_init.sql`
 * seeded for the single pre-accounts row — as one period starting on the
 * most recent Aug 1 (the start of the currently-running school year).
 * Called once at registration for every new user, unless they instead
 * inherit the legacy row's period(s) via the claim in `routes/auth.ts`.
 */
export async function provisionDefaultSettings(db: D1Database, userId: number, today: IsoDate): Promise<void> {
  await db
    .prepare(
      `INSERT INTO settings (user_id, effective_from, full_time_weekly_minutes, workload_percent_x100,
         target_minutes_mon, target_minutes_tue, target_minutes_wed,
         target_minutes_thu, target_minutes_fri, target_minutes_sat, target_minutes_sun)
       VALUES (?1, ?2, 2520, 10000, 504, 504, 504, 504, 504, 0, 0)`,
    )
    .bind(userId, mostRecentAugustFirst(today))
    .run();
}
