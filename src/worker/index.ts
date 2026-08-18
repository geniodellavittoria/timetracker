import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { HonoEnv } from './env.ts';
import { authGate } from './auth.ts';
import { errorBody, notFound } from './errors.ts';
import { entriesRoutes } from './routes/entries.ts';
import { settingsRoutes } from './routes/settings.ts';
import { summaryRoutes } from './routes/summary.ts';

const app = new Hono<HonoEnv>();

// Runs before assets are served (wrangler.jsonc sets run_worker_first), so the
// password gate covers the UI and not just the API.
app.use('*', authGate);

const api = new Hono<HonoEnv>();
api.get('/health', (c) => c.json({ status: 'ok' }));
api.route('/entries', entriesRoutes);
api.route('/settings', settingsRoutes);
api.route('/summary', summaryRoutes);

app.route('/api', api);

// An unknown /api path must be a JSON 404, never the SPA shell.
app.all('/api/*', (c) => notFound(c, `No such endpoint: ${c.req.path}`));

app.onError((err, c) => {
  // basicAuth signals its 401 challenge by throwing, so this must pass through
  // untouched — swallowing it would turn every login prompt into a 500.
  if (err instanceof HTTPException) return err.getResponse();
  console.error('Unhandled error', err);
  return c.json(errorBody('internal_error', 'Etwas ist schiefgelaufen.'), 500);
});

// Everything else is the React app, with SPA fallback handled by the assets binding.
app.all('*', (c) => c.env.ASSETS.fetch(c.req.raw));

export default app;
