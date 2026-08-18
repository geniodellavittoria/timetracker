/** Reserved owner for data that predates accounts — never a real user id, since AUTOINCREMENT starts at 1. */
export const LEGACY_USER_ID = 0;

export interface UserRow {
  id: number;
  email: string;
  createdAt: string;
}

interface UserRowWithHash extends UserRow {
  passwordHash: string;
}

interface RawUserRow {
  id: number;
  email: string;
  password_hash: string;
  created_at: string;
}

function toDomain(row: RawUserRow): UserRowWithHash {
  return { id: row.id, email: row.email, passwordHash: row.password_hash, createdAt: row.created_at };
}

export async function createUser(db: D1Database, email: string, passwordHash: string): Promise<UserRow> {
  const row = await db
    .prepare('INSERT INTO users (email, password_hash) VALUES (?1, ?2) RETURNING id, email, created_at')
    .bind(email, passwordHash)
    .first<RawUserRow>();
  if (!row) throw new Error('Insert of a new user did not return a row');
  return { id: row.id, email: row.email, createdAt: row.created_at };
}

export async function findUserByEmail(db: D1Database, email: string): Promise<UserRowWithHash | null> {
  const row = await db
    .prepare('SELECT id, email, password_hash, created_at FROM users WHERE email = ?1')
    .bind(email)
    .first<RawUserRow>();
  return row ? toDomain(row) : null;
}

export async function findUserById(db: D1Database, id: number): Promise<UserRow | null> {
  const row = await db
    .prepare('SELECT id, email, password_hash, created_at FROM users WHERE id = ?1')
    .bind(id)
    .first<RawUserRow>();
  return row ? { id: row.id, email: row.email, createdAt: row.created_at } : null;
}

/**
 * Iteration count chosen for Workers' CPU-time budget, not OWASP's 600,000+
 * baseline: at 100k iterations PBKDF2-SHA256 stays comfortably inside a
 * free-tier request's CPU-time limit. Stored inside every hash so it can be
 * raised later (e.g. on a paid plan with more CPU headroom) without
 * invalidating passwords hashed under the old count.
 */
const PBKDF2_ITERATIONS = 100_000;

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const bits = await deriveBits(password, salt, PBKDF2_ITERATIONS);
  return `pbkdf2$${PBKDF2_ITERATIONS}$${toBase64Url(salt)}$${toBase64Url(new Uint8Array(bits))}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false;
  const iterations = Number(parts[1]);
  if (!Number.isInteger(iterations) || iterations <= 0) return false;
  const salt = fromBase64Url(parts[2]!);
  const expected = fromBase64Url(parts[3]!);
  const actual = new Uint8Array(await deriveBits(password, salt, iterations));
  return timingSafeEqual(actual, expected);
}

function deriveBits(password: string, salt: Uint8Array, iterations: number): Promise<ArrayBuffer> {
  return crypto.subtle
    .importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits'])
    .then((key) => crypto.subtle.deriveBits(
      { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations },
      key,
      256,
    ));
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
