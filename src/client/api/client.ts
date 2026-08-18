import type { ValidationIssue } from '@shared/validation.ts';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly issues: ValidationIssue[] = [],
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** Lets a form map a server rejection back onto the field that caused it. */
  issueFor(path: string): ValidationIssue | undefined {
    return this.issues.find((i) => i.path === path);
  }
}

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...init?.headers },
  });

  if (res.status === 204) return undefined as T;

  const body = await res.json().catch(() => null);

  if (!res.ok) {
    const error = (body as { error?: { code?: string; message?: string; issues?: ValidationIssue[] } })?.error;
    throw new ApiError(
      res.status,
      error?.code ?? 'unknown',
      error?.message ?? `Request failed with ${res.status}.`,
      error?.issues ?? [],
    );
  }

  return body as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  put: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  del: (path: string) => request<void>(path, { method: 'DELETE' }),
};
