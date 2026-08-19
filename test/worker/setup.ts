import { applyD1Migrations, env } from 'cloudflare:test';
import { beforeAll, beforeEach } from 'vitest';
import type { D1Migration } from '@cloudflare/vitest-pool-workers';
import { registerTestUser, setDefaultCookie } from './helpers.ts';

declare global {
  namespace Cloudflare {
    interface Env {
      /** Injected by vitest.config.ts, which reads the real migrations directory. */
      TEST_MIGRATIONS: D1Migration[];
    }
  }
}

beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
});

/**
 * Reset explicitly rather than leaning on the pool's storage isolation: every
 * test then starts from an empty log with a single fresh, authenticated
 * test user — regardless of what ran before it. Tests that specifically
 * exercise multi-user behavior register additional users of their own via
 * `registerTestUser` without touching the default cookie.
 */
beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare('DELETE FROM sessions'),
    env.DB.prepare('DELETE FROM entries'),
    env.DB.prepare('DELETE FROM settings'),
    env.DB.prepare('DELETE FROM users'),
  ]);
  const { userId, cookie } = await registerTestUser();
  // Registration provisions the first Pensum period at the *real* wall-clock
  // "most recent Aug 1", but most tests exercise fixed fictional dates
  // (2026-08-xx). Backdating it to the epoch keeps every such fixture date
  // covered regardless of when the suite actually runs.
  await env.DB.prepare('UPDATE settings SET effective_from = ?1 WHERE user_id = ?2').bind('2000-01-01', userId).run();
  setDefaultCookie(cookie);
});
