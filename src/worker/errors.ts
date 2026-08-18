import type { Context } from 'hono';
import type { ValidationIssue } from '@shared/validation.ts';

export type ErrorCode = 'validation_error' | 'not_found' | 'internal_error' | 'unauthorized';

export interface ErrorBody {
  error: { code: ErrorCode; message: string; issues?: ValidationIssue[] };
}

export function errorBody(code: ErrorCode, message: string, issues?: ValidationIssue[]): ErrorBody {
  return { error: { code, message, ...(issues?.length ? { issues } : {}) } };
}

/** 400 carrying the shared validation issues, so the form can map them back onto fields. */
export function validationError(c: Context, issues: ValidationIssue[]) {
  return c.json(
    errorBody('validation_error', issues[0]?.message ?? 'Die Anfrage ist ungültig.', issues),
    400,
  );
}

export function notFound(c: Context, message = 'Nicht gefunden.') {
  return c.json(errorBody('not_found', message), 404);
}
