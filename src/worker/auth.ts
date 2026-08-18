import { getCookie } from 'hono/cookie';
import type { MiddlewareHandler } from 'hono';
import type { HonoEnv } from './env.ts';
import { errorBody } from './errors.ts';
import { findSessionByToken } from './repo/sessions.ts';

export const SESSION_COOKIE = 'session';

/** Registration/login/logout must stay reachable while logged out; everything else under `/api` requires a session. */
const PUBLIC_API_PATHS = new Set(['/api/health', '/api/auth/register', '/api/auth/login', '/api/auth/logout']);

/**
 * Cookie-session gate for the API only — the SPA shell itself (and its
 * `/login` route) is served unauthenticated; the client redirects when
 * `GET /api/auth/me` 401s. `run_worker_first` in wrangler.jsonc still routes
 * `/api/*` to the Worker; it's unrelated to this gate.
 */
export const sessionAuth: MiddlewareHandler<HonoEnv> = async (c, next) => {
  if (!c.req.path.startsWith('/api/') || PUBLIC_API_PATHS.has(c.req.path)) return next();

  const token = getCookie(c, SESSION_COOKIE);
  const session = token ? await findSessionByToken(c.env.DB, token) : null;
  if (!session) return c.json(errorBody('unauthorized', 'Bitte anmelden.'), 401);

  c.set('userId', session.userId);
  return next();
};
