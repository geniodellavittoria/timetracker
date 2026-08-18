import { Hono } from 'hono';
import type { HonoEnv } from './env.ts';
import { sessionAuth } from './auth.ts';
import { errorBody, notFound } from './errors.ts';
import { authRoutes } from './routes/auth.ts';
import { entriesRoutes } from './routes/entries.ts';
import { settingsRoutes } from './routes/settings.ts';
import { summaryRoutes } from './routes/summary.ts';

const app = new Hono<HonoEnv>();

// Gates everything under /api except health/register/login/logout. The SPA
// shell itself is served unauthenticated (see auth.ts) — the client
// redirects to /login when GET /api/auth/me 401s.
app.use('*', sessionAuth);

const api = new Hono<HonoEnv>();
api.get('/health', (c) => c.json({ status: 'ok' }));
api.route('/auth', authRoutes);
api.route('/entries', entriesRoutes);
api.route('/settings', settingsRoutes);
api.route('/summary', summaryRoutes);

app.route('/api', api);

// An unknown /api path must be a JSON 404, never the SPA shell.
app.all('/api/*', (c) => notFound(c, `No such endpoint: ${c.req.path}`));

app.onError((err, c) => {
  console.error('Unhandled error', err);
  return c.json(errorBody('internal_error', 'Etwas ist schiefgelaufen.'), 500);
});

// Everything else is the React app, with SPA fallback handled by the assets binding.
app.all('*', (c) => c.env.ASSETS.fetch(c.req.raw));

export default app;
