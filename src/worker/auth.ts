import { basicAuth } from 'hono/basic-auth';
import type { MiddlewareHandler } from 'hono';
import type { HonoEnv } from './env.ts';

/**
 * Password gate for the whole app, UI included — which is why wrangler.jsonc sets
 * `run_worker_first`, so assets don't bypass this.
 *
 * With APP_PASSWORD unset there is no prompt at all, keeping local dev
 * frictionless. In production it is a Worker secret:
 *   wrangler secret put APP_PASSWORD
 */
export const authGate: MiddlewareHandler<HonoEnv> = async (c, next) => {
  const password = c.env.APP_PASSWORD;
  if (!password) return next();
  return basicAuth({ username: 'me', password })(c, next);
};
