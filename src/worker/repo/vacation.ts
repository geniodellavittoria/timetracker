import type { VacationAllowance, VacationAllowanceInput } from '@shared/types.ts';

interface AllowanceRow {
  year: number;
  days_x10: number;
  carry_over_days_x10: number;
  updated_at: string;
}

const COLUMNS = 'year, days_x10, carry_over_days_x10, updated_at';

function toDomain(row: AllowanceRow): VacationAllowance {
  return {
    year: row.year,
    days: row.days_x10 / 10,
    carryOverDays: row.carry_over_days_x10 / 10,
    updatedAt: row.updated_at,
  };
}

/** Sorted ascending by year. */
export async function listAllowances(db: D1Database, userId: number): Promise<VacationAllowance[]> {
  const { results } = await db
    .prepare(`SELECT ${COLUMNS} FROM vacation_allowances WHERE user_id = ?1 ORDER BY year ASC`)
    .bind(userId)
    .all<AllowanceRow>();
  return results.map(toDomain);
}

export async function getAllowance(db: D1Database, userId: number, year: number): Promise<VacationAllowance | null> {
  const row = await db
    .prepare(`SELECT ${COLUMNS} FROM vacation_allowances WHERE user_id = ?1 AND year = ?2`)
    .bind(userId, year)
    .first<AllowanceRow>();
  return row ? toDomain(row) : null;
}

export async function upsertAllowance(
  db: D1Database,
  userId: number,
  year: number,
  input: VacationAllowanceInput,
): Promise<VacationAllowance> {
  const row = await db
    .prepare(
      `INSERT INTO vacation_allowances (user_id, year, days_x10, carry_over_days_x10)
       VALUES (?1, ?2, ?3, ?4)
       ON CONFLICT (user_id, year) DO UPDATE SET
         days_x10            = excluded.days_x10,
         carry_over_days_x10 = excluded.carry_over_days_x10,
         updated_at          = strftime('%Y-%m-%dT%H:%M:%SZ','now')
       RETURNING ${COLUMNS}`,
    )
    .bind(userId, year, Math.round(input.days * 10), Math.round(input.carryOverDays * 10))
    .first<AllowanceRow>();
  if (!row) throw new Error('Upsert of a vacation allowance did not return a row');
  return toDomain(row);
}

export async function deleteAllowance(db: D1Database, userId: number, year: number): Promise<boolean> {
  const result = await db
    .prepare('DELETE FROM vacation_allowances WHERE user_id = ?1 AND year = ?2')
    .bind(userId, year)
    .run();
  return (result.meta.changes ?? 0) > 0;
}
