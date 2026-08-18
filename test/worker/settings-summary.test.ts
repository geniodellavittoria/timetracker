import { describe, expect, it } from 'vitest';
import { normalDay, putJson, request } from './helpers.ts';


const defaults = {
  targetMinutesByWeekday: [504, 504, 504, 504, 504, 0, 0],
  fullTimeWeeklyMinutes: 2520,
  workloadPercentX10: 1000,
};

describe('settings', () => {
  it('seeds a 42h week at 100%', async () => {
    const body = await (await request('/api/settings')).json() as any;
    expect(body).toMatchObject(defaults);
  });

  it('round-trips a part-time week with a mid-week day off', async () => {
    // 80%, Friday off.
    const res = await putJson('/api/settings', {
      targetMinutesByWeekday: [504, 504, 504, 504, 0, 0, 0],
      fullTimeWeeklyMinutes: 2520,
      workloadPercentX10: 800,
    });
    expect(res.status).toBe(200);

    const reread = await (await request('/api/settings')).json() as any;
    expect(reread.targetMinutesByWeekday).toEqual([504, 504, 504, 504, 0, 0, 0]);
    expect(reread.workloadPercentX10).toBe(800);
  });

  it('rejects a malformed payload', async () => {
    expect((await putJson('/api/settings', { ...defaults, targetMinutesByWeekday: [480, 480] })).status).toBe(400);
    expect((await putJson('/api/settings', { ...defaults, workloadPercentX10: 1500 })).status).toBe(400);
    expect((await putJson('/api/settings', { ...defaults, targetMinutesByWeekday: [480, 480, 480, 480, 480, 0, 9999] })).status).toBe(400);
    expect((await putJson('/api/settings', { ...defaults, targetMinutesByWeekday: [480, 480, 480, 480, 480, 0, 1.5] })).status).toBe(400);
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
    await putJson('/api/settings', {
      targetMinutesByWeekday: [504, 504, 504, 504, 0, 0, 0],
      fullTimeWeeklyMinutes: 2520,
      workloadPercentX10: 800,
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
