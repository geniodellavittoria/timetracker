import { z } from 'zod';
import { isValidIsoDate } from './dates.ts';
import { MINUTES_PER_DAY, parseTimeOfDay } from './time.ts';
import { DAY_TYPES } from './types.ts';
import type { TimeEntryInput } from './types.ts';

/** Max span a single range query may cover, so a bogus `from` can't materialize 700k days. */
export const MAX_RANGE_DAYS = 400;

export type IssueCode =
  | 'invalid_date'
  | 'invalid_time'
  | 'times_required_for_normal_day'
  | 'times_not_allowed_for_special_day'
  | 'leave_not_after_arrival'
  | 'break_negative'
  | 'break_exceeds_span'
  | 'blocks_overlap'
  | 'invalid_range'
  | 'range_too_large'
  | 'invalid_target'
  | 'email_taken';

export interface ValidationIssue {
  path: string;
  code: IssueCode;
  message: string;
}

export const isoDateSchema = z.string().refine(isValidIsoDate, 'Muss ein gültiges Datum im Format JJJJ-MM-TT sein.');

export const timeOfDaySchema = z
  .string()
  .refine((v) => parseTimeOfDay(v) !== null, 'Muss eine gültige Uhrzeit im Format HH:MM sein.');

export const dayTypeSchema = z.enum(DAY_TYPES);

export const blockInputSchema = z.strictObject({
  arrival: timeOfDaySchema,
  leave: timeOfDaySchema,
  breakMinutes: z.number().int().min(0).max(MINUTES_PER_DAY),
});

export const entryInputSchema = z.discriminatedUnion('dayType', [
  z.strictObject({
    dayType: z.literal('normal'),
    blocks: z.array(blockInputSchema).min(1, 'Bitte mindestens einen Zeitblock erfassen.'),
    note: z.string().max(500).nullable().default(null),
  }),
  z.strictObject({
    dayType: z.enum(['vacation', 'sick', 'holiday']),
    // Optional on the wire (the client never sends it for a special day), but
    // always present once parsed, so `TimeEntryInput.blocks` is never
    // undefined regardless of day type. Deliberately not length-capped here —
    // shape only; `validateEntryInput` is what rejects a special day
    // carrying blocks, with the specific `times_not_allowed_for_special_day`
    // code rather than a generic schema error.
    blocks: z.array(blockInputSchema).optional().default([]),
    note: z.string().max(500).nullable().default(null),
  }),
]);

export const settingsInputSchema = z.strictObject({
  targetMinutesByWeekday: z.array(z.number().int().min(0).max(MINUTES_PER_DAY)).length(7),
  fullTimeWeeklyMinutes: z.number().int().min(0).max(7 * MINUTES_PER_DAY),
  workloadPercentX100: z.number().int().min(0).max(10000),
});

export const groupBySchema = z.enum(['week', 'month', 'none']).default('none');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(320, 'Die E-Mail-Adresse ist zu lang.')
  .refine((v) => EMAIL_RE.test(v), 'Ungültige E-Mail-Adresse.');

export const passwordSchema = z
  .string()
  .min(8, 'Das Passwort muss mindestens 8 Zeichen lang sein.')
  .max(200, 'Das Passwort ist zu lang.');

export const registerInputSchema = z.strictObject({
  email: emailSchema,
  password: passwordSchema,
});

export const loginInputSchema = z.strictObject({
  email: emailSchema,
  // No length/strength check here — a login attempt should never leak the password policy.
  password: z.string().min(1, 'Bitte Passwort eingeben.'),
});

/**
 * The business rules, in one place, shared by the client's live preview and the
 * Worker's authoritative check. The SQL CHECK constraints enforce the same
 * things a third time — deliberately, since the database is the layer that
 * survives a bug in the other two.
 */
export function validateEntryInput(input: TimeEntryInput): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!DAY_TYPES.includes(input.dayType)) {
    return [{ path: 'dayType', code: 'invalid_date', message: 'Unbekannter Tagestyp.' }];
  }

  if (input.dayType !== 'normal') {
    if (input.blocks.length > 0) {
      issues.push({
        path: 'dayType',
        code: 'times_not_allowed_for_special_day',
        message: 'Ferien-, Krankheits- und Feiertage dürfen keine Zeiten enthalten.',
      });
    }
    return issues;
  }

  if (input.blocks.length === 0) {
    return [{
      path: 'blocks',
      code: 'times_required_for_normal_day',
      message: 'Bitte mindestens einen Zeitblock erfassen.',
    }];
  }

  const parsed: { arrival: number; leave: number; breakMinutes: number; index: number }[] = [];

  input.blocks.forEach((block, index) => {
    const arrival = parseTimeOfDay(block.arrival);
    const leave = parseTimeOfDay(block.leave);
    if (arrival === null) {
      issues.push({ path: `blocks.${index}.arrival`, code: 'invalid_time', message: 'Kommen ist keine gültige Uhrzeit.' });
    }
    if (leave === null) {
      issues.push({ path: `blocks.${index}.leave`, code: 'invalid_time', message: 'Gehen ist keine gültige Uhrzeit.' });
    }
    if (arrival === null || leave === null) return;

    if (leave <= arrival) {
      issues.push({
        path: `blocks.${index}.leave`,
        code: 'leave_not_after_arrival',
        message: 'Gehen muss nach Kommen liegen — Nachtschichten werden nicht unterstützt.',
      });
      return;
    }

    const breakMinutes = block.breakMinutes ?? 0;
    if (breakMinutes < 0) {
      issues.push({ path: `blocks.${index}.breakMinutes`, code: 'break_negative', message: 'Die Pause darf nicht negativ sein.' });
      return;
    }
    if (breakMinutes > leave - arrival) {
      issues.push({
        path: `blocks.${index}.breakMinutes`,
        code: 'break_exceeds_span',
        message: 'Die Pause ist länger als die Zeit zwischen Kommen und Gehen.',
      });
      return;
    }
    parsed.push({ arrival, leave, breakMinutes, index });
  });

  if (issues.length > 0) return issues;

  // Overlapping blocks would silently double-count worked minutes when
  // summed, so this is a correctness check, not just tidiness — sort by
  // start time and require each block to begin at or after the previous
  // one's end.
  const byArrival = [...parsed].sort((a, b) => a.arrival - b.arrival);
  for (let i = 1; i < byArrival.length; i += 1) {
    if (byArrival[i]!.arrival < byArrival[i - 1]!.leave) {
      issues.push({
        path: `blocks.${byArrival[i]!.index}.arrival`,
        code: 'blocks_overlap',
        message: 'Zeitblöcke dürfen sich nicht überschneiden.',
      });
    }
  }

  return issues;
}

export function validateRange(from: unknown, to: unknown): ValidationIssue[] {
  if (!isValidIsoDate(from)) {
    return [{ path: 'from', code: 'invalid_date', message: '`from` muss ein gültiges Datum (JJJJ-MM-TT) sein.' }];
  }
  if (!isValidIsoDate(to)) {
    return [{ path: 'to', code: 'invalid_date', message: '`to` muss ein gültiges Datum (JJJJ-MM-TT) sein.' }];
  }
  if (from > to) {
    return [{ path: 'to', code: 'invalid_range', message: '`to` darf nicht vor `from` liegen.' }];
  }
  const days = Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000,
  ) + 1;
  if (days > MAX_RANGE_DAYS) {
    return [{
      path: 'to',
      code: 'range_too_large',
      message: `Zeitraum darf ${MAX_RANGE_DAYS} Tage nicht überschreiten.`,
    }];
  }
  return [];
}

/** Turn a zod error into the same issue shape the hand-written rules produce. */
export function zodIssues(error: z.ZodError): ValidationIssue[] {
  return error.issues.map((issue) => ({
    path: issue.path.join('.') || '(root)',
    code: 'invalid_date' as IssueCode,
    message: issue.message,
  }));
}
