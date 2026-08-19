import { describe, expect, it } from 'vitest';
import { normalDay, postJson, putJson, request } from './helpers.ts';

const defaults = {
  effectiveFrom: '2000-01-01',
  targetMinutesByWeekday: [504, 504, 504, 504, 504, 0, 0],
  fullTimeWeeklyMinutes: 2520,
  workloadPercentX100: 10000,
};

/** The default test user always has exactly one period until a test adds more. */
async function firstPeriodId(): Promise<number> {
  const body = await (await request('/api/settings')).json() as { periods: { id: number }[] };
  return body.periods[0]!.id;
}

describe('settings', () => {
  it('seeds a 42h week at 100%, backdated to the epoch by the test harness', async () => {
    const body = await (await request('/api/settings')).json() as any;
    expect(body.periods).toHaveLength(1);
    expect(body.periods[0]).toMatchObject(defaults);
  });

  it('round-trips a part-time week with a mid-week day off', async () => {
    // 80%, Friday off.
    const id = await firstPeriodId();
    const res = await putJson(`/api/settings/periods/${id}`, {
      effectiveFrom: '2000-01-01',
      targetMinutesByWeekday: [504, 504, 504, 504, 0, 0, 0],
      fullTimeWeeklyMinutes: 2520,
      workloadPercentX100: 8025,
    });
    expect(res.status).toBe(200);

    const reread = await (await request('/api/settings')).json() as any;
    expect(reread.periods[0].targetMinutesByWeekday).toEqual([504, 504, 504, 504, 0, 0, 0]);
    expect(reread.periods[0].workloadPercentX100).toBe(8025);
  });

  it('rejects a malformed payload', async () => {
    expect((await postJson('/api/settings/periods', { ...defaults, targetMinutesByWeekday: [480, 480] })).status).toBe(400);
    expect((await postJson('/api/settings/periods', { ...defaults, workloadPercentX100: 15000 })).status).toBe(400);
    expect((await postJson('/api/settings/periods', { ...defaults, targetMinutesByWeekday: [480, 480, 480, 480, 480, 0, 9999] })).status).toBe(400);
    expect((await postJson('/api/settings/periods', { ...defaults, targetMinutesByWeekday: [480, 480, 480, 480, 480, 0, 1.5] })).status).toBe(400);
    expect((await postJson('/api/settings/periods', { ...defaults, effectiveFrom: 'not-a-date' })).status).toBe(400);
  });

  it('adds, lists and resolves a second dated period', async () => {
    const created = await postJson('/api/settings/periods', {
      effectiveFrom: '2026-08-20',
      targetMinutesByWeekday: [384, 384, 384, 384, 384, 0, 0],
      fullTimeWeeklyMinutes: 2400,
      workloadPercentX100: 8000,
    });
    expect(created.status).toBe(201);

    const body = await (await request('/api/settings')).json() as any;
    expect(body.periods.map((p: any) => p.effectiveFrom)).toEqual(['2000-01-01', '2026-08-20']);

    // A day before the new period's start still uses the old one.
    const before = await (await request('/api/summary?from=2026-08-19&to=2026-08-19&groupBy=none&today=2026-08-19')).json() as any;
    expect(before.days[0].targetMinutes).toBe(504);
    // The effective date itself, and everything after, uses the new one.
    const on = await (await request('/api/summary?from=2026-08-20&to=2026-08-20&groupBy=none&today=2026-08-20')).json() as any;
    expect(on.days[0].targetMinutes).toBe(384);
  });

  it('rejects a second period on a date that is already taken', async () => {
    const res = await postJson('/api/settings/periods', {
      effectiveFrom: '2000-01-01',
      targetMinutesByWeekday: [480, 480, 480, 480, 480, 0, 0],
      fullTimeWeeklyMinutes: 2400,
      workloadPercentX100: 10000,
    });
    expect(res.status).toBe(409);
  });

  it('deletes a period, but never the last remaining one', async () => {
    const onlyId = await firstPeriodId();
    const refused = await request(`/api/settings/periods/${onlyId}`, { method: 'DELETE' });
    expect(refused.status).toBe(409);

    const created = await postJson('/api/settings/periods', {
      effectiveFrom: '2026-08-20',
      targetMinutesByWeekday: [384, 384, 384, 384, 384, 0, 0],
      fullTimeWeeklyMinutes: 2400,
      workloadPercentX100: 8000,
    });
    const { id: secondId } = await created.json() as { id: number };

    const ok = await request(`/api/settings/periods/${secondId}`, { method: 'DELETE' });
    expect(ok.status).toBe(204);

    const body = await (await request('/api/settings')).json() as any;
    expect(body.periods).toHaveLength(1);
  });

  it('404s updating or deleting a period that does not exist', async () => {
    expect((await putJson('/api/settings/periods/999999', defaults)).status).toBe(404);
    expect((await request('/api/settings/periods/999999', { method: 'DELETE' })).status).toBe(404);
  });
});

describe('summary', () => {
  it('computes worked, target and balance per day', async () => {
    await putJson('/api/entries/2026-08-17', normalDay({ leave: '17:15', breakMinutes: 45 })); // 510
    await putJson('/api/entries/2026-08-18', { dayType: 'vacation' });

    const s = await (await request(
      '/api/summary?from=2026-08-17&to=2026-08-23&groupBy=none&today=2026-08-21',
    )).json() as any;

    expect(s.days).toHaveLength(7);
    expect(s.days[0]).toMatchObject({ workedMinutes: 510, targetMinutes: 504, balanceMinutes: 6 });
    expect(s.days[1]).toMatchObject({ workedMinutes: 504, balanceMinutes: 0 });

    expect(s.totals.targetMinutesScheduled).toBe(2520);
    expect(s.totals.targetMinutesTracked).toBe(1008);
    expect(s.totals.balanceMinutes).toBe(6);
    // Wed and Thu are past-and-unlogged; Fri is today and also unlogged.
    expect(s.totals.missingWorkdays).toEqual(['2026-08-19', '2026-08-20', '2026-08-21']);
    expect(s.cumulativeBalanceMinutes).toBe(6);
  });

  it('never flags future days', async () => {
    const s = await (await request(
      '/api/summary?from=2026-08-17&to=2026-08-23&groupBy=none&today=2026-08-16',
    )).json() as any;
    expect(s.totals.missingWorkdays).toEqual([]);
  });

  it('books work on a mid-week day off as pure overtime and never flags it', async () => {
    const id = await firstPeriodId();
    await putJson(`/api/settings/periods/${id}`, {
      effectiveFrom: '2000-01-01',
      targetMinutesByWeekday: [504, 504, 504, 504, 0, 0, 0],
      fullTimeWeeklyMinutes: 2520,
      workloadPercentX100: 8000,
    });
    await putJson('/api/entries/2026-08-21', normalDay({ arrival: '09:00', leave: '13:00' })); // Friday

    const s = await (await request(
      '/api/summary?from=2026-08-17&to=2026-08-23&groupBy=none&today=2026-08-23',
    )).json() as any;

    const friday = s.days.find((d: any) => d.date === '2026-08-21');
    expect(friday).toMatchObject({ workedMinutes: 240, targetMinutes: 0, balanceMinutes: 240 });
    expect(s.totals.missingWorkdays).not.toContain('2026-08-21');
    expect(s.totals.targetMinutesScheduled).toBe(2016);
  });

  it('buckets a fortnight into two weeks with matching totals', async () => {
    await putJson('/api/entries/2026-08-17', normalDay({ leave: '17:24' })); // 564, +60
    await putJson('/api/entries/2026-08-25', normalDay({ leave: '16:24' })); // 504, 0

    const s = await (await request(
      '/api/summary?from=2026-08-17&to=2026-08-30&groupBy=week&today=2026-08-30',
    )).json() as any;

    expect(s.buckets.map((b: any) => b.key)).toEqual(['2026-W34', '2026-W35']);
    expect(s.buckets[0].totals.balanceMinutes).toBe(60);
    expect(s.buckets[1].totals.balanceMinutes).toBe(0);
    const summed = s.buckets.reduce((acc: number, b: any) => acc + b.totals.workedMinutes, 0);
    expect(summed).toBe(s.totals.workedMinutes);
  });

  it('clips month week-buckets to the month bounds', async () => {
    const s = await (await request(
      '/api/summary?from=2026-08-01&to=2026-08-31&groupBy=week&today=2026-08-31',
    )).json() as any;
    expect(s.buckets).toHaveLength(6);
    expect(s.buckets[0].from).toBe('2026-08-01');
    expect(s.buckets[5].to).toBe('2026-08-31');
  });

  it('rejects a bad today parameter rather than silently ignoring it', async () => {
    expect((await request('/api/summary?from=2026-08-17&to=2026-08-23&today=nope')).status).toBe(400);
  });
});
