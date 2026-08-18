import { env } from 'cloudflare:test';
import app from '@worker/index.ts';
import type { AppEnv } from '@worker/env.ts';

export function testEnv(overrides: Partial<AppEnv> = {}): AppEnv {
  return { ...env, ...overrides };
}

/** Set by `setup.ts`'s `beforeEach` to a fresh test user's session, so most tests need no auth boilerplate at all. */
let defaultCookie: string | undefined;

export function setDefaultCookie(cookie: string | undefined) {
  defaultCookie = cookie;
}

export function request(path: string, init: RequestInit = {}, overrides?: Partial<AppEnv>) {
  const headers = new Headers(init.headers);
  if (!headers.has('cookie') && defaultCookie) headers.set('cookie', defaultCookie);
  return app.fetch(new Request(`https://test.local${path}`, { ...init, headers }), testEnv(overrides));
}

function jsonRequest(method: string, path: string, body: unknown, overrides?: Partial<AppEnv>, cookie?: string) {
  const headers: HeadersInit = { 'content-type': 'application/json' };
  if (cookie !== undefined) (headers as Record<string, string>).cookie = cookie;
  return request(path, { method, headers, body: JSON.stringify(body) }, overrides);
}

export const putJson = (path: string, body: unknown, overrides?: Partial<AppEnv>, cookie?: string) =>
  jsonRequest('PUT', path, body, overrides, cookie);

export const postJson = (path: string, body: unknown, overrides?: Partial<AppEnv>, cookie?: string) =>
  jsonRequest('POST', path, body, overrides, cookie);

export const normalDay = (blockOver: Record<string, unknown> = {}) => ({
  dayType: 'normal',
  blocks: [{ arrival: '08:00', leave: '17:00', breakMinutes: 0, ...blockOver }],
  note: null,
});

let counter = 0;

/**
 * Registers a fresh user (unauthenticated request — registration is a
 * public path) and returns its session cookie. Does NOT change
 * `defaultCookie` — call `setDefaultCookie` explicitly if a test wants this
 * user to become the implicit actor for subsequent `request`/`putJson` calls.
 */
export async function registerTestUser(overrides: { email?: string; password?: string } = {}) {
  counter += 1;
  const email = overrides.email ?? `user${counter}@example.test`;
  const password = overrides.password ?? 'correct horse battery staple';

  const res = await request('/api/auth/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (res.status !== 201) throw new Error(`registerTestUser failed with ${res.status}: ${await res.text()}`);

  const cookie = extractCookie(res.headers.get('set-cookie'));
  const body = await res.json() as { id: number; email: string };
  return { userId: body.id, email: body.email, password, cookie };
}

function extractCookie(setCookieHeader: string | null): string {
  if (!setCookieHeader) throw new Error('Expected a Set-Cookie header from register/login');
  return setCookieHeader.split(';')[0]!;
}
