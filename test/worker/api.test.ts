import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import type { AppEnv } from '@worker/env.ts';
import { normalDay, putJson, request } from './helpers.ts';


describe('health', () => {
  it('responds', async () => {
    const res = await request('/api/health');
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ status: 'ok' });
  });
});

describe('auth gate', () => {
  it('is off when no password is configured', async () => {
    expect((await request('/api/health')).status).toBe(200);
  });

  it('challenges when a password is configured', async () => {
    const res = await request('/api/health', undefined, { APP_PASSWORD: 'hunter2' });
    expect(res.status).toBe(401);
    expect(res.headers.get('www-authenticate')).toMatch(/Basic/i);
  });

  it('admits the right credentials', async () => {
    const res = await request(
      '/api/health',
      { headers: { authorization: `Basic ${btoa('me:hunter2')}` } },
      { APP_PASSWORD: 'hunter2' },
    );
    expect(res.status).toBe(200);
  });
});

describe('entries CRUD', () => {
  it('creates with 201 and updates with 200, keeping one row per date', async () => {
    const created = await putJson('/api/entries/2026-08-17', normalDay({ leave: '17:15', breakMinutes: 45 }));
    expect(created.status).toBe(201);
    await expect(created.json()).resolves.toMatchObject({
      date: '2026-08-17', arrival: '08:00', leave: '17:15', breakMinutes: 45,
    });

    const updated = await putJson('/api/entries/2026-08-17', normalDay({ leave: '18:00', breakMinutes: 30 }));
    expect(updated.status).toBe(200);

    const list = await (await request('/api/entries?from=2026-08-17&to=2026-08-17')).json() as any;
    expect(list.entries).toHaveLength(1);
    expect(list.entries[0].leave).toBe('18:00');
  });

  it('reads a single entry and 404s for a missing one', async () => {
    await putJson('/api/entries/2026-08-17', normalDay());
    expect((await request('/api/entries/2026-08-17')).status).toBe(200);

    const missing = await request('/api/entries/2026-08-18');
    expect(missing.status).toBe(404);
    await expect(missing.json()).resolves.toMatchObject({ error: { code: 'not_found' } });
  });

  it('deletes once, then 404s', async () => {
    await putJson('/api/entries/2026-08-17', normalDay());
    expect((await request('/api/entries/2026-08-17', { method: 'DELETE' })).status).toBe(204);
    expect((await request('/api/entries/2026-08-17', { method: 'DELETE' })).status).toBe(404);
  });

  it('stores a special day with null times', async () => {
    const res = await putJson('/api/entries/2026-08-19', {
      dayType: 'vacation', arrival: null, leave: null, breakMinutes: null, note: 'Ferien',
    });
    expect(res.status).toBe(201);
    await expect(res.json()).resolves.toMatchObject({
      dayType: 'vacation', arrival: null, leave: null, breakMinutes: null, note: 'Ferien',
    });
  });

  it('lists only in-range rows, ascending', async () => {
    for (const d of ['2026-08-16', '2026-08-17', '2026-08-18', '2026-08-24']) {
      await putJson(`/api/entries/${d}`, normalDay());
    }
    const list = await (await request('/api/entries?from=2026-08-17&to=2026-08-23')).json() as any;
    expect(list.entries.map((e: any) => e.date)).toEqual(['2026-08-17', '2026-08-18']);
  });
});

describe('entries validation', () => {
  const expectIssue = async (res: Response, code: string) => {
    expect(res.status).toBe(400);
    const body = await res.json() as any;
    expect(body.error.code).toBe('validation_error');
    expect(body.error.issues[0].code).toBe(code);
  };

  it('rejects a leaving time at or before arrival', async () => {
    await expectIssue(
      await putJson('/api/entries/2026-08-18', normalDay({ arrival: '17:00', leave: '09:00' })),
      'leave_not_after_arrival',
    );
    await expectIssue(
      await putJson('/api/entries/2026-08-18', normalDay({ arrival: '09:00', leave: '09:00' })),
      'leave_not_after_arrival',
    );
  });

  it('rejects breaks longer than the span', async () => {
    await expectIssue(
      await putJson('/api/entries/2026-08-18', normalDay({ arrival: '09:00', leave: '17:00', breakMinutes: 600 })),
      'break_exceeds_span',
    );
  });

  it('rejects a special day carrying times', async () => {
    await expectIssue(
      await putJson('/api/entries/2026-08-18', normalDay({ dayType: 'vacation' })),
      'times_not_allowed_for_special_day',
    );
  });

  it('rejects a date key in the body — the URL is authoritative', async () => {
    const res = await putJson('/api/entries/2026-08-18', normalDay({ date: '2026-01-01' }));
    expect(res.status).toBe(400);
  });

  it('rejects an empty-string time rather than coercing it', async () => {
    expect((await putJson('/api/entries/2026-08-18', normalDay({ arrival: '' }))).status).toBe(400);
  });

  it('rejects a malformed date in the URL', async () => {
    expect((await putJson('/api/entries/2026-02-30', normalDay())).status).toBe(400);
  });

  it('rejects an inverted or oversized range', async () => {
    expect((await request('/api/entries?from=2026-08-31&to=2026-08-01')).status).toBe(400);
    expect((await request('/api/entries?from=2020-01-01&to=2026-12-31')).status).toBe(400);
    expect((await request('/api/entries')).status).toBe(400);
  });
});

describe('storage constraints', () => {
  /**
   * The app layer already blocks this. The point of the test is that the
   * database blocks it too, so a bug in the app layer cannot persist a
   * nonsensical row.
   */
  it('rejects an overnight row inserted behind the API', async () => {
    const db = (env as AppEnv).DB;
    await expect(
      db.prepare(
        `INSERT INTO entries (date, day_type, arrival_minutes, leave_minutes, break_minutes)
         VALUES ('2026-08-18', 'normal', 1320, 360, 0)`,
      ).run(),
    ).rejects.toThrow(/CHECK|constraint/i);
  });

  it('rejects a break longer than the span behind the API', async () => {
    const db = (env as AppEnv).DB;
    await expect(
      db.prepare(
        `INSERT INTO entries (date, day_type, arrival_minutes, leave_minutes, break_minutes)
         VALUES ('2026-08-18', 'normal', 540, 1020, 600)`,
      ).run(),
    ).rejects.toThrow(/CHECK|constraint/i);
  });

  it('rejects a second row for the same date', async () => {
    await putJson('/api/entries/2026-08-17', normalDay());
    const db = (env as AppEnv).DB;
    await expect(
      db.prepare(
        `INSERT INTO entries (date, day_type, arrival_minutes, leave_minutes, break_minutes)
         VALUES ('2026-08-17', 'normal', 540, 1020, 0)`,
      ).run(),
    ).rejects.toThrow(/UNIQUE|constraint/i);
  });
});

describe('an unknown API path', () => {
  it('is a JSON 404, not the SPA shell', async () => {
    const res = await request('/api/nope');
    expect(res.status).toBe(404);
    expect(res.headers.get('content-type')).toMatch(/application\/json/);
  });
});
