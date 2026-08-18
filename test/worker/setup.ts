import { applyD1Migrations, env } from 'cloudflare:test';
import { beforeAll, beforeEach } from 'vitest';
import type { D1Migration } from '@cloudflare/vitest-pool-workers';

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
 * test then starts from an empty log and the seeded 42h/100% settings,
 * regardless of what ran before it.
 */
beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare('DELETE FROM entries'),
    env.DB.prepare(
      `UPDATE settings SET
         full_time_weekly_minutes = 2520, workload_percent_x10 = 1000,
         target_minutes_mon = 504, target_minutes_tue = 504, target_minutes_wed = 504,
         target_minutes_thu = 504, target_minutes_fri = 504,
         target_minutes_sat = 0,   target_minutes_sun = 0
       WHERE id = 1`,
    ),
  ]);
});
