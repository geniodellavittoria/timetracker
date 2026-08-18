import type { TimeOfDay } from './types.ts';

export const MINUTES_PER_DAY = 1440;

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

/**
 * Strict 'HH:MM' -> minutes since midnight. Returns null for anything else.
 *
 * Deliberately rejects '8:30', '24:00' and '08:30:00'. The last one matters:
 * Chrome's <input type="time"> emits seconds when `step` is sub-minute, which is
 * why every TimeField in the app sets step={60}.
 */
export function parseTimeOfDay(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const m = TIME_RE.exec(value);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

export function isValidTimeOfDay(value: unknown): value is TimeOfDay {
  return parseTimeOfDay(value) !== null;
}

/** 510 -> '08:30'. */
export function formatTimeOfDay(minutes: number): TimeOfDay {
  const m = ((Math.trunc(minutes) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  return `${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`;
}

/**
 * 510 -> '8h 30m'. With `signed`, 0 -> '±0h 00m' and -75 -> '−1h 15m'
 * (U+2212 minus, which aligns with digits far better than a hyphen).
 */
export function formatDuration(minutes: number, opts: { signed?: boolean } = {}): string {
  const total = Math.trunc(minutes);
  const abs = Math.abs(total);
  const body = `${Math.floor(abs / 60)}h ${pad2(abs % 60)}m`;
  if (!opts.signed) return total < 0 ? `−${body}` : body;
  if (total === 0) return `±0h 00m`;
  return `${total > 0 ? '+' : '−'}${body}`;
}

/** 462 -> '7.70'. Formatting only — never feed this back into arithmetic. */
export function formatDecimalHours(minutes: number, digits = 2): string {
  return (minutes / 60).toFixed(digits);
}

/** Decimal hours from a settings/input field -> whole minutes. */
export function hoursToMinutes(hours: number): number {
  return Math.round(hours * 60);
}

/** Whole minutes -> decimal hours, trimmed of trailing zeros ('8.4', not '8.40'). */
export function minutesToHoursValue(minutes: number): number {
  return Math.round((minutes / 60) * 1000) / 1000;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}
