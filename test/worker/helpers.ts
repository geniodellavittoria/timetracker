import { env } from 'cloudflare:test';
import app from '@worker/index.ts';
import type { AppEnv } from '@worker/env.ts';

export function testEnv(overrides: Partial<AppEnv> = {}): AppEnv {
  return { ...env, ...overrides };
}

export function request(path: string, init?: RequestInit, overrides?: Partial<AppEnv>) {
  return app.fetch(new Request(`https://test.local${path}`, init), testEnv(overrides));
}

export function putJson(path: string, body: unknown, overrides?: Partial<AppEnv>) {
  return request(
    path,
    { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) },
    overrides,
  );
}

export const normalDay = (over: Record<string, unknown> = {}) => ({
  dayType: 'normal',
  arrival: '08:00',
  leave: '17:00',
  breakMinutes: 0,
  note: null,
  ...over,
});
