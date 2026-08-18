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
  | 'invalid_range'
  | 'range_too_large'
  | 'invalid_target';

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

export const entryInputSchema = z.strictObject({
  dayType: dayTypeSchema,
  arrival: timeOfDaySchema.nullable(),
  leave: timeOfDaySchema.nullable(),
  breakMinutes: z.number().int().min(0).max(MINUTES_PER_DAY).nullable(),
  note: z.string().max(500).nullable().default(null),
});

export const settingsInputSchema = z.strictObject({
  targetMinutesByWeekday: z.array(z.number().int().min(0).max(MINUTES_PER_DAY)).length(7),
  fullTimeWeeklyMinutes: z.number().int().min(0).max(7 * MINUTES_PER_DAY),
  workloadPercentX10: z.number().int().min(0).max(1000),
});

export const groupBySchema = z.enum(['week', 'month', 'none']).default('none');

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
    if (input.arrival !== null || input.leave !== null || (input.breakMinutes ?? 0) !== 0) {
      issues.push({
        path: 'dayType',
        code: 'times_not_allowed_for_special_day',
        message: 'Ferien-, Krankheits- und Feiertage dürfen keine Zeiten enthalten.',
      });
    }
    return issues;
  }

  const arrival = parseTimeOfDay(input.arrival);
  const leave = parseTimeOfDay(input.leave);

  if (input.arrival === null || input.leave === null) {
    issues.push({
      path: 'arrival',
      code: 'times_required_for_normal_day',
      message: 'Bitte Kommen und Gehen erfassen.',
    });
    return issues;
  }
  if (arrival === null) {
    issues.push({ path: 'arrival', code: 'invalid_time', message: 'Kommen ist keine gültige Uhrzeit.' });
  }
  if (leave === null) {
    issues.push({ path: 'leave', code: 'invalid_time', message: 'Gehen ist keine gültige Uhrzeit.' });
  }
  if (arrival === null || leave === null) return issues;

  if (leave <= arrival) {
    issues.push({
      path: 'leave',
      code: 'leave_not_after_arrival',
      message: 'Gehen muss nach Kommen liegen — Nachtschichten werden nicht unterstützt.',
    });
    return issues;
  }

  const breakMinutes = input.breakMinutes ?? 0;
  if (breakMinutes < 0) {
    issues.push({ path: 'breakMinutes', code: 'break_negative', message: 'Die Pause darf nicht negativ sein.' });
  } else if (breakMinutes > leave - arrival) {
    issues.push({
      path: 'breakMinutes',
      code: 'break_exceeds_span',
      message: 'Die Pause ist länger als die Zeit zwischen Kommen und Gehen.',
    });
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
