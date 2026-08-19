import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import type { AppEnv } from '@worker/env.ts';
import { normalDay, postJson, putJson, registerTestUser, request, setDefaultCookie } from './helpers.ts';

describe('register', () => {
  it('creates an account, sets a session cookie, and provisions default settings', async () => {
    const res = await postJson('/api/auth/register', { email: 'new@example.test', password: 'a very good password' });
    expect(res.status).toBe(201);
    await expect(res.json()).resolves.toEqual({ id: expect.any(Number), email: 'new@example.test' });
    expect(res.headers.get('set-cookie')).toMatch(/^session=/);
  });

  it('rejects a duplicate email', async () => {
    const user = await registerTestUser({ email: 'dup@example.test' });
    setDefaultCookie(user.cookie);

    const res = await postJson('/api/auth/register', { email: 'dup@example.test', password: 'another password' });
    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toMatchObject({ error: { code: 'validation_error' } });
  });

  it('normalizes email casing and whitespace', async () => {
    await postJson('/api/auth/register', { email: '  Foo@Example.Test  ', password: 'a very good password' });
    const res = await postJson('/api/auth/login', { email: 'foo@example.test', password: 'a very good password' });
    expect(res.status).toBe(200);
  });

  it('rejects a weak password', async () => {
    const res = await postJson('/api/auth/register', { email: 'weak@example.test', password: 'short' });
    expect(res.status).toBe(400);
  });
});

describe('login', () => {
  it('gives the same generic 401 for an unknown email and a wrong password', async () => {
    const user = await registerTestUser({ email: 'known@example.test', password: 'the right password' });

    const wrongPassword = await postJson('/api/auth/login', { email: user.email, password: 'nope' });
    const unknownEmail = await postJson('/api/auth/login', { email: 'nobody@example.test', password: 'nope' });

    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect((await wrongPassword.json())).toEqual(await unknownEmail.json());
  });

  it('logs in with the right credentials and sets a usable cookie', async () => {
    const user = await registerTestUser({ email: 'login@example.test', password: 'the right password' });

    const res = await postJson('/api/auth/login', { email: user.email, password: 'the right password' });
    expect(res.status).toBe(200);
    const cookie = res.headers.get('set-cookie')!.split(';')[0]!;

    const me = await request('/api/auth/me', { headers: { cookie } });
    expect(me.status).toBe(200);
  });
});

describe('logout', () => {
  it('clears the session so the old cookie no longer authenticates', async () => {
    const user = await registerTestUser();

    const before = await request('/api/auth/me', { headers: { cookie: user.cookie } });
    expect(before.status).toBe(200);

    const loggedOut = await request('/api/auth/logout', { method: 'POST', headers: { cookie: user.cookie } });
    expect(loggedOut.status).toBe(204);

    const after = await request('/api/auth/me', { headers: { cookie: user.cookie } });
    expect(after.status).toBe(401);
  });
});

describe('me', () => {
  it('401s with no cookie', async () => {
    expect((await request('/api/auth/me', { headers: { cookie: '' } })).status).toBe(401);
  });

  it('200s with a valid cookie', async () => {
    const user = await registerTestUser();
    const res = await request('/api/auth/me', { headers: { cookie: user.cookie } });
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ id: user.userId, email: user.email });
  });
});

describe('legacy data claim', () => {
  it('the first registration after a fresh deploy inherits pre-accounts data; later registrations get a clean slate', async () => {
    const db = (env as AppEnv).DB;
    // Simulate pre-migration production data sitting under the sentinel owner
    // (a fresh table wipe leaves no user_id=0 row at all, so this must INSERT
    // one — a real pre-accounts deployment would already have it).
    await db.batch([
      db.prepare(
        `INSERT INTO entries (user_id, date, day_type, arrival_minutes, leave_minutes, break_minutes)
         VALUES (0, '2026-08-10', 'normal', 480, 1020, 30)`,
      ),
      db.prepare(
        `INSERT INTO settings (user_id, full_time_weekly_minutes, workload_percent_x100,
           target_minutes_mon, target_minutes_tue, target_minutes_wed, target_minutes_thu,
           target_minutes_fri, target_minutes_sat, target_minutes_sun)
         VALUES (0, 2520, 9000, 504, 504, 504, 504, 504, 0, 0)`,
      ),
    ]);

    const first = await registerTestUser({ email: 'first@example.test' });
    const firstEntries = await request('/api/entries?from=2026-08-01&to=2026-08-31', { headers: { cookie: first.cookie } });
    const firstSettings = await request('/api/settings', { headers: { cookie: first.cookie } });
    await expect(firstEntries.json()).resolves.toMatchObject({ entries: [{ date: '2026-08-10' }] });
    await expect(firstSettings.json()).resolves.toMatchObject({ workloadPercentX100: 9000 });

    const second = await registerTestUser({ email: 'second@example.test' });
    const secondEntries = await request('/api/entries?from=2026-08-01&to=2026-08-31', { headers: { cookie: second.cookie } });
    const secondSettings = await request('/api/settings', { headers: { cookie: second.cookie } });
    await expect(secondEntries.json()).resolves.toEqual({ entries: [] });
    await expect(secondSettings.json()).resolves.toMatchObject({ workloadPercentX100: 10000 }); // default, not claimed
  });
});

describe('cross-user isolation', () => {
  it("one user's entries are invisible to another, and a per-date lookup 404s rather than leaking the owner", async () => {
    const a = await registerTestUser({ email: 'a@example.test' });
    const b = await registerTestUser({ email: 'b@example.test' });

    await putJson('/api/entries/2026-08-17', normalDay(), undefined, a.cookie);

    const listAsB = await request('/api/entries?from=2026-08-01&to=2026-08-31', { headers: { cookie: b.cookie } });
    await expect(listAsB.json()).resolves.toEqual({ entries: [] });

    const getAsB = await request('/api/entries/2026-08-17', { headers: { cookie: b.cookie } });
    expect(getAsB.status).toBe(404);
  });
});
