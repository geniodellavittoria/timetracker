import type { ByWeekday, Settings, SettingsInput } from '@shared/types.ts';

interface SettingsRow {
  full_time_weekly_minutes: number;
  workload_percent_x10: number;
  target_minutes_mon: number;
  target_minutes_tue: number;
  target_minutes_wed: number;
  target_minutes_thu: number;
  target_minutes_fri: number;
  target_minutes_sat: number;
  target_minutes_sun: number;
  updated_at: string;
}

const COLUMNS = `full_time_weekly_minutes, workload_percent_x10,
  target_minutes_mon, target_minutes_tue, target_minutes_wed, target_minutes_thu,
  target_minutes_fri, target_minutes_sat, target_minutes_sun, updated_at`;

function toDomain(row: SettingsRow): Settings {
  return {
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
    workloadPercentX10: row.workload_percent_x10,
    updatedAt: row.updated_at,
  };
}

export async function getSettings(db: D1Database): Promise<Settings> {
  const row = await db.prepare(`SELECT ${COLUMNS} FROM settings WHERE id = 1`).first<SettingsRow>();
  if (!row) throw new Error('Settings row is missing — has the migration been applied?');
  return toDomain(row);
}

export async function updateSettings(db: D1Database, input: SettingsInput): Promise<Settings> {
  const [mon, tue, wed, thu, fri, sat, sun] = input.targetMinutesByWeekday;
  await db
    .prepare(
      `UPDATE settings SET
         full_time_weekly_minutes = ?1,
         workload_percent_x10     = ?2,
         target_minutes_mon = ?3, target_minutes_tue = ?4, target_minutes_wed = ?5,
         target_minutes_thu = ?6, target_minutes_fri = ?7, target_minutes_sat = ?8,
         target_minutes_sun = ?9,
         updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now')
       WHERE id = 1`,
    )
    .bind(input.fullTimeWeeklyMinutes, input.workloadPercentX10, mon, tue, wed, thu, fri, sat, sun)
    .run();
  return getSettings(db);
}
