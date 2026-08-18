const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days, fixed — no sliding renewal in v1.

export async function createSession(db: D1Database, userId: number): Promise<{ token: string; expiresAt: string }> {
  const token = toBase64Url(crypto.getRandomValues(new Uint8Array(32)));
  const id = await sha256Hex(token);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();

  await db
    .prepare('INSERT INTO sessions (id, user_id, expires_at) VALUES (?1, ?2, ?3)')
    .bind(id, userId, expiresAt)
    .run();

  return { token, expiresAt };
}

/** A token past its expiry is treated as absent, and opportunistically cleaned up — no cron needed for this app's session volume. */
export async function findSessionByToken(db: D1Database, token: string): Promise<{ userId: number } | null> {
  const id = await sha256Hex(token);
  const row = await db
    .prepare('SELECT user_id, expires_at FROM sessions WHERE id = ?1')
    .bind(id)
    .first<{ user_id: number; expires_at: string }>();
  if (!row) return null;

  if (Date.parse(row.expires_at) <= Date.now()) {
    await db.prepare('DELETE FROM sessions WHERE id = ?1').bind(id).run();
    return null;
  }
  return { userId: row.user_id };
}

export async function deleteSession(db: D1Database, token: string): Promise<void> {
  const id = await sha256Hex(token);
  await db.prepare('DELETE FROM sessions WHERE id = ?1').bind(id).run();
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
