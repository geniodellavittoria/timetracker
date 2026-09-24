import { describe, expect, it } from 'vitest';
import { normalDay, putJson, registerTestUser, request } from './helpers.ts';

const vacationDay = { dayType: 'vacation', note: null };

describe('vacation allowances', () => {
  it('upserts, lists and deletes an allowance per year', async () => {
    expect((await putJson('/api/vacation/allowances/2026', { days: 25, carryOverDays: 2.5 })).status).toBe(200);
    const updated = await putJson('/api/vacation/allowances/2026', { days: 22.5 });
    expect(await updated.json()).toMatchObject({ year: 2026, days: 22.5, carryOverDays: 0 });

    const list = await (await request('/api/vacation/allowances')).json() as any;
    expect(list.allowances).toHaveLength(1);

    expect((await request('/api/vacation/allowances/2026', { method: 'DELETE' })).status).toBe(204);
    expect((await request('/api/vacation/allowances/2026', { method: 'DELETE' })).status).toBe(404);
  });

  it('rejects quarter days, negative allowances and bad years', async () => {
    expect((await putJson('/api/vacation/allowances/2026', { days: 20.25 })).status).toBe(400);
    expect((await putJson('/api/vacation/allowances/2026', { days: -1 })).status).toBe(400);
    expect((await putJson('/api/vacation/allowances/abc', { days: 20 })).status).toBe(400);
  });
});

describe('vacation summary', () => {
  it('counts Ferien entries in the Ferien year against the allowance', async () => {
    await putJson('/api/vacation/allowances/2026', { days: 25 });
    await putJson('/api/entries/2026-08-17', vacationDay); // Mon, taken
    await putJson('/api/entries/2026-08-22', vacationDay); // Sat, no target
    await putJson('/api/entries/2026-08-18', normalDay());
    await putJson('/api/entries/2027-07-30', vacationDay); // Fri, planned, last week of the year
    await putJson('/api/entries/2027-08-02', vacationDay); // next Ferien year

    const res = await request('/api/vacation/summary?year=2026&today=2026-09-01');
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      from: '2026-08-01',
      to: '2027-07-31',
      availableDays: 25,
      takenDays: 1,
      plannedDays: 1,
      remainingDays: 23,
      plannedDates: ['2027-07-30'],
    });
  });

  it('only sees the current user', async () => {
    await putJson('/api/vacation/allowances/2026', { days: 25 });
    await putJson('/api/entries/2026-08-17', vacationDay);

    const other = await registerTestUser();
    const res = await request('/api/vacation/summary?year=2026&today=2026-09-01', { headers: { cookie: other.cookie } });
    expect(await res.json()).toMatchObject({ allowance: null, takenDays: 0 });
  });

  it('requires a valid year and today', async () => {
    expect((await request('/api/vacation/summary')).status).toBe(400);
    expect((await request('/api/vacation/summary?year=2026&today=nope')).status).toBe(400);
  });
});
