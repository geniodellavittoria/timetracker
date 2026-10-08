import { describe, expect, it } from 'vitest';
import type { YearComparisonResponse } from '@shared/types.ts';
import { normalDay, putJson, registerTestUser, request } from './helpers.ts';

describe('year comparison', () => {
  it('returns one series per ISO year with entries', async () => {
    await putJson('/api/entries/2025-08-18', normalDay());
    await putJson('/api/entries/2026-08-17', normalDay({ leave: '12:00' }));

    const res = await request('/api/summary/years?today=2026-10-08');
    expect(res.status).toBe(200);
    const body = await res.json() as YearComparisonResponse;

    expect(body.today).toBe('2026-10-08');
    expect(body.years.map((y) => y.year)).toEqual([2025, 2026]);
    expect(body.years[0]!.weeks[33]).toMatchObject({ week: 34, workedMinutes: 540 });
    expect(body.years[1]!.weeks[33]).toMatchObject({ week: 34, workedMinutes: 240 });
  });

  it('ignores entries after `today` and other users\' data', async () => {
    await putJson('/api/entries/2026-08-17', normalDay());
    await putJson('/api/entries/2027-02-01', normalDay());

    const other = await registerTestUser();
    await putJson('/api/entries/2024-05-06', normalDay(), undefined, other.cookie);

    const body = await (await request('/api/summary/years?today=2026-10-08')).json() as YearComparisonResponse;
    expect(body.years.map((y) => y.year)).toEqual([2026]);
  });

  it('rejects an invalid `today`', async () => {
    expect((await request('/api/summary/years?today=2026-13-01')).status).toBe(400);
  });
});
