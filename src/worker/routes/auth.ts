import { Hono } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import type { Context } from 'hono';
import { loginInputSchema, registerInputSchema, zodIssues } from '@shared/validation.ts';
import type { AuthUser } from '@shared/types.ts';
import { SESSION_COOKIE } from '../auth.ts';
import { errorBody, notFound, validationError } from '../errors.ts';
import { createUser, findUserByEmail, findUserById, hashPassword, LEGACY_USER_ID, verifyPassword } from '../repo/users.ts';
import { createSession, deleteSession } from '../repo/sessions.ts';
import { provisionDefaultSettings } from '../repo/settings.ts';
import type { HonoEnv } from '../env.ts';

export const authRoutes = new Hono<HonoEnv>();

const SESSION_MAX_AGE_S = 30 * 24 * 60 * 60;

async function startSession(c: Context<HonoEnv>, userId: number): Promise<void> {
  const { token } = await createSession(c.env.DB, userId);
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: 'Lax',
    path: '/',
    maxAge: SESSION_MAX_AGE_S,
  });
}

authRoutes.post('/register', async (c) => {
  const raw = await c.req.json().catch(() => null);
  const parsed = registerInputSchema.safeParse(raw);
  if (!parsed.success) return validationError(c, zodIssues(parsed.error));
  const { email, password } = parsed.data;

  const passwordHash = await hashPassword(password);
  const emailTakenError = () => c.json(
    errorBody('validation_error', 'Diese E-Mail-Adresse ist bereits registriert.',
      [{ path: 'email', code: 'email_taken', message: 'Diese E-Mail-Adresse ist bereits registriert.' }]),
    409,
  );

  let user;
  try {
    user = await createUser(c.env.DB, email, passwordHash);
  } catch (err) {
    if (err instanceof Error && /UNIQUE constraint failed/i.test(err.message)) return emailTakenError();
    throw err;
  }

  // Claim the pre-accounts legacy data (user_id = 0) — a no-op once someone
  // already has, since the sentinel rows only exist until the first claim.
  // Optionally restricted to one email via LEGACY_CLAIM_EMAIL.
  const allowClaim = !c.env.LEGACY_CLAIM_EMAIL || c.env.LEGACY_CLAIM_EMAIL.trim().toLowerCase() === user.email;
  let claimedSettings = false;
  if (allowClaim) {
    const [settingsResult] = await c.env.DB.batch([
      c.env.DB.prepare('UPDATE settings SET user_id = ?1 WHERE user_id = ?2').bind(user.id, LEGACY_USER_ID),
      c.env.DB.prepare('UPDATE entries SET user_id = ?1 WHERE user_id = ?2').bind(user.id, LEGACY_USER_ID),
    ]);
    claimedSettings = (settingsResult!.meta.changes ?? 0) > 0;
  }
  if (!claimedSettings) {
    // UTC "today" — same fallback source used in routes/summary.ts. Just the
    // default starting point for an editable date, so a boundary-day
    // off-by-one against the registrant's local time is not worth chasing.
    await provisionDefaultSettings(c.env.DB, user.id, new Date().toISOString().slice(0, 10));
  }

  await startSession(c, user.id);
  return c.json({ id: user.id, email: user.email } satisfies AuthUser, 201);
});

// A syntactically valid but unreachable hash, used to keep login's response
// time similar whether or not the email exists — otherwise skipping
// verifyPassword's PBKDF2 work for an unknown email would make "unknown
// email" measurably faster than "wrong password", leaking which is which.
const DUMMY_HASH = 'pbkdf2$100000$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

authRoutes.post('/login', async (c) => {
  const raw = await c.req.json().catch(() => null);
  const parsed = loginInputSchema.safeParse(raw);
  if (!parsed.success) return validationError(c, zodIssues(parsed.error));
  const { email, password } = parsed.data;

  const user = await findUserByEmail(c.env.DB, email);
  const ok = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);

  // Deliberately the same status/message for "no such user" and "wrong
  // password" — a failed login must not reveal which one it was.
  if (!user || !ok) return c.json(errorBody('unauthorized', 'E-Mail oder Passwort ist falsch.'), 401);

  await startSession(c, user.id);
  return c.json({ id: user.id, email: user.email } satisfies AuthUser);
});

authRoutes.post('/logout', async (c) => {
  const token = getCookie(c, SESSION_COOKIE);
  if (token) await deleteSession(c.env.DB, token);
  deleteCookie(c, SESSION_COOKIE, { path: '/' });
  return c.body(null, 204);
});

authRoutes.get('/me', async (c) => {
  const userId = c.get('userId');
  const user = await findUserById(c.env.DB, userId);
  if (!user) return notFound(c, 'Benutzer nicht gefunden.');
  return c.json({ id: user.id, email: user.email } satisfies AuthUser);
});
