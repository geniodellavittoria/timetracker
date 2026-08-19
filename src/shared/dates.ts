import type { IsoDate, WeekdayIndex } from './types.ts';

/**
 * Every function here builds dates with `Date.UTC` and reads them with `getUTC*`.
 *
 * The reason, concretely: under TZ=Europe/Zurich,
 *   new Date(2026, 7, 18).toISOString().slice(0, 10) === '2026-08-17'
 * Any local-time Date round-tripped through toISOString() loses a day east of
 * UTC. `todayIsoDateLocal()` is the single deliberate exception and never
 * touches toISOString().
 */

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 86_400_000;

const MONTH_LABELS = [
  'Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun',
  'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez',
] as const;

export const WEEKDAY_LABELS: readonly string[] = [
  'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So',
];

export const WEEKDAY_LABELS_LONG: readonly string[] = [
  'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag',
];

/** True only for a real calendar date — '2026-02-30' is rejected. */
export function isValidIsoDate(value: unknown): value is IsoDate {
  if (typeof value !== 'string') return false;
  const m = ISO_DATE_RE.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return false;
  const dt = utc(y, mo, d);
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

export function toUtcDate(date: IsoDate): Date {
  const m = ISO_DATE_RE.exec(date);
  if (!m) throw new RangeError(`Not an ISO date: ${date}`);
  return utc(Number(m[1]), Number(m[2]), Number(m[3]));
}

export function fromUtcDate(d: Date): IsoDate {
  return `${String(d.getUTCFullYear()).padStart(4, '0')}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

export function addDays(date: IsoDate, n: number): IsoDate {
  return fromUtcDate(new Date(toUtcDate(date).getTime() + n * MS_PER_DAY));
}

export function daysBetween(from: IsoDate, to: IsoDate): number {
  return Math.round((toUtcDate(to).getTime() - toUtcDate(from).getTime()) / MS_PER_DAY);
}

/** ISO dates sort correctly as plain strings, which is the whole point of the format. */
export function compareDates(a: IsoDate, b: IsoDate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * The start of the currently-running school/contract year: this year's Aug 1
 * if `today` is on or after it, otherwise last year's. Used only as the
 * default `effectiveFrom` for a newly-provisioned account's first Pensum
 * period — never applied retroactively to existing data.
 */
export function mostRecentAugustFirst(today: IsoDate): IsoDate {
  const year = Number(today.slice(0, 4));
  const thisYearAug1 = `${year}-08-01`;
  return today >= thisYearAug1 ? thisYearAug1 : `${year - 1}-08-01`;
}

/** 0 = Monday … 6 = Sunday. */
export function weekdayOf(date: IsoDate): WeekdayIndex {
  return ((toUtcDate(date).getUTCDay() + 6) % 7) as WeekdayIndex;
}

export function startOfIsoWeek(date: IsoDate): IsoDate {
  return addDays(date, -weekdayOf(date));
}

export function endOfIsoWeek(date: IsoDate): IsoDate {
  return addDays(startOfIsoWeek(date), 6);
}

/**
 * ISO-8601 week number: weeks start Monday, and week 1 is the week containing
 * the first Thursday of the year.
 */
export function isoWeekOf(date: IsoDate): { year: number; week: number } {
  const thursday = toUtcDate(addDays(startOfIsoWeek(date), 3));
  const year = thursday.getUTCFullYear();
  const jan1 = Date.UTC(year, 0, 1);
  const week = Math.floor((thursday.getTime() - jan1) / MS_PER_DAY / 7) + 1;
  return { year, week };
}

/** '2026-W34'. */
export function isoWeekKey(date: IsoDate): string {
  const { year, week } = isoWeekOf(date);
  return `${year}-W${pad2(week)}`;
}

export function isValidIsoWeekKey(key: string): boolean {
  const m = /^(\d{4})-W(\d{2})$/.exec(key);
  if (!m) return false;
  const week = Number(m[2]);
  if (week < 1 || week > 53) return false;
  // Round-trip guards against '2026-W53' in a 52-week year.
  return isoWeekKey(isoWeekKeyToRange(key).from) === key;
}

export function isoWeekKeyToRange(key: string): { from: IsoDate; to: IsoDate } {
  const m = /^(\d{4})-W(\d{2})$/.exec(key);
  if (!m) throw new RangeError(`Not an ISO week key: ${key}`);
  const [year, week] = [Number(m[1]), Number(m[2])];
  // Jan 4th is always in ISO week 1.
  const from = addDays(startOfIsoWeek(`${year}-01-04`), (week - 1) * 7);
  return { from, to: addDays(from, 6) };
}

/** '2026-08'. */
export function monthKey(date: IsoDate): string {
  return date.slice(0, 7);
}

export function isValidMonthKey(key: string): boolean {
  const m = /^(\d{4})-(\d{2})$/.exec(key);
  return !!m && Number(m[2]) >= 1 && Number(m[2]) <= 12;
}

export function startOfMonth(date: IsoDate): IsoDate {
  return `${date.slice(0, 7)}-01`;
}

/** Leap-year aware: day 0 of the next month is the last day of this one. */
export function endOfMonth(date: IsoDate): IsoDate {
  const d = toUtcDate(date);
  return fromUtcDate(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)));
}

export function monthKeyToRange(key: string): { from: IsoDate; to: IsoDate } {
  if (!isValidMonthKey(key)) throw new RangeError(`Not a month key: ${key}`);
  const from = `${key}-01`;
  return { from, to: endOfMonth(from) };
}

export function addMonths(key: string, n: number): string {
  const [y, m] = key.split('-').map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}`;
}

export function addWeeks(key: string, n: number): string {
  return isoWeekKey(addDays(isoWeekKeyToRange(key).from, n * 7));
}

/** Inclusive on both ends. */
export function eachDateInRange(from: IsoDate, to: IsoDate): IsoDate[] {
  const out: IsoDate[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

/**
 * The browser's local calendar date. CLIENT ONLY.
 *
 * Never uses toISOString(): reading the local getters and padding by hand is the
 * only way to get the date the user actually sees on their wall clock.
 */
export function todayIsoDateLocal(now: Date = new Date()): IsoDate {
  return `${String(now.getFullYear()).padStart(4, '0')}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}

/** '17. Aug' — Swiss-style day with trailing period. */
export function formatDayMonth(date: IsoDate): string {
  const d = toUtcDate(date);
  return `${d.getUTCDate()}. ${MONTH_LABELS[d.getUTCMonth()]}`;
}

/** 'Mo 17. Aug'. */
export function formatWeekdayDayMonth(date: IsoDate): string {
  return `${WEEKDAY_LABELS[weekdayOf(date)]} ${formatDayMonth(date)}`;
}

/** 'August 2026'. */
export function formatMonthLabel(key: string): string {
  const { from } = monthKeyToRange(key);
  const d = toUtcDate(from);
  const long = [
    'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
    'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
  ] as const;
  return `${long[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** 'Woche 34 · 17.–23. Aug 2026'. */
export function formatWeekLabel(key: string): string {
  const { from, to } = isoWeekKeyToRange(key);
  const week = Number(key.slice(6));
  const year = toUtcDate(to).getUTCFullYear();
  const fromD = toUtcDate(from);
  const toD = toUtcDate(to);
  const sameMonth = fromD.getUTCMonth() === toD.getUTCMonth();
  const span = sameMonth
    ? `${fromD.getUTCDate()}.–${toD.getUTCDate()}. ${MONTH_LABELS[toD.getUTCMonth()]}`
    : `${formatDayMonth(from)} – ${formatDayMonth(to)}`;
  return `Woche ${week} · ${span} ${year}`;
}

/**
 * Date.UTC() remaps years 0-99 onto 1900-1999, which would make '0001-01-01'
 * look like an invalid date rather than an out-of-range one. setUTCFullYear has
 * no such special case.
 */
function utc(year: number, month1: number, day: number): Date {
  const d = new Date(0);
  d.setUTCFullYear(year, month1 - 1, day);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}
