import { addDays, fromUtcDate, weekdayOf } from './dates.ts';
import type { IsoDate, WeekdayIndex } from './types.ts';

export const CANTONS = [
  { code: 'ZH', name: 'Zürich' },
  { code: 'BE', name: 'Bern' },
  { code: 'LU', name: 'Luzern' },
  { code: 'UR', name: 'Uri' },
  { code: 'SZ', name: 'Schwyz' },
  { code: 'OW', name: 'Obwalden' },
  { code: 'NW', name: 'Nidwalden' },
  { code: 'GL', name: 'Glarus' },
  { code: 'ZG', name: 'Zug' },
  { code: 'FR', name: 'Freiburg' },
  { code: 'SO', name: 'Solothurn' },
  { code: 'BS', name: 'Basel-Stadt' },
  { code: 'BL', name: 'Basel-Landschaft' },
  { code: 'SH', name: 'Schaffhausen' },
  { code: 'AR', name: 'Appenzell Ausserrhoden' },
  { code: 'AI', name: 'Appenzell Innerrhoden' },
  { code: 'SG', name: 'St. Gallen' },
  { code: 'GR', name: 'Graubünden' },
  { code: 'AG', name: 'Aargau' },
  { code: 'TG', name: 'Thurgau' },
  { code: 'TI', name: 'Tessin' },
  { code: 'VD', name: 'Waadt' },
  { code: 'VS', name: 'Wallis' },
  { code: 'NE', name: 'Neuenburg' },
  { code: 'GE', name: 'Genf' },
  { code: 'JU', name: 'Jura' },
] as const satisfies readonly { code: string; name: string }[];

export type CantonCode = (typeof CANTONS)[number]['code'];

export interface Holiday {
  date: IsoDate;
  name: string;
}

type Rule =
  | { kind: 'fixed'; month: number; day: number }
  /** Offset in days from Easter Sunday — negative for Good Friday. */
  | { kind: 'easter'; offsetDays: number }
  /** The n-th occurrence (1 = first) of a weekday within a month. */
  | { kind: 'nthWeekdayOfMonth'; month: number; weekday: WeekdayIndex; n: number }
  /** A weekday offsetDays after the n-th Sunday of a month — e.g. "Thursday after the first Sunday of September". */
  | { kind: 'afterNthSundayOfMonth'; month: number; n: number; offsetDays: number };

interface HolidayDef {
  name: string;
  rule: Rule;
  cantons: readonly CantonCode[];
}

const ALL_CANTONS = CANTONS.map((c) => c.code);
/** Good Friday / Easter Monday / Whit Monday are the two commonly-cited exceptions to nationwide observance. */
const WITHOUT_TI_VS = ALL_CANTONS.filter((c) => c !== 'TI' && c !== 'VS');

const THURSDAY: WeekdayIndex = 3;
const SUNDAY: WeekdayIndex = 6;

/**
 * Canton membership below is a best-effort starting point, not a verified
 * legal source — see the disclaimer shown alongside the "Feiertage" card in
 * Settings. Confidence varies a lot by entry:
 *
 *   HIGH   — Neujahr, Nationalfeiertag, Weihnachten (fixed, truly nationwide),
 *            Auffahrt (nationwide movable), Karfreitag/Ostermontag/Pfingstmontag
 *            (nationwide except TI/VS), and the four canton-unique holidays
 *            (Näfelser Fahrt, Jeûne genevois, Lundi du Jeûne, Neuenburg's
 *            Republic Day) — all cross-checked against public sources.
 *   LOWER  — Berchtoldstag, Tag der Arbeit, Stephanstag, and the Catholic
 *            feast days (Fronleichnam, Mariä Himmelfahrt, Allerheiligen,
 *            Mariä Empfängnis, St. Josef) — canton membership here is from
 *            general knowledge and is the most likely to need correcting
 *            for a specific canton or Gemeinde.
 */
const HOLIDAY_DEFS: HolidayDef[] = [
  { name: 'Neujahr', rule: { kind: 'fixed', month: 1, day: 1 }, cantons: ALL_CANTONS },
  {
    name: 'Berchtoldstag',
    rule: { kind: 'fixed', month: 1, day: 2 },
    cantons: ['ZH', 'BE', 'LU', 'GL', 'ZG', 'FR', 'SO', 'SH', 'AR', 'SG', 'AG', 'TG', 'VD', 'NE'],
  },
  { name: 'Heilige Drei Könige', rule: { kind: 'fixed', month: 1, day: 6 }, cantons: ['SZ', 'TI'] },
  { name: 'St. Josef', rule: { kind: 'fixed', month: 3, day: 19 }, cantons: ['UR', 'SZ', 'OW', 'NW', 'ZG', 'TI', 'VS'] },
  {
    name: 'Näfelser Fahrt',
    rule: { kind: 'nthWeekdayOfMonth', month: 4, weekday: THURSDAY, n: 1 },
    cantons: ['GL'],
  },
  { name: 'Karfreitag', rule: { kind: 'easter', offsetDays: -2 }, cantons: WITHOUT_TI_VS },
  { name: 'Ostermontag', rule: { kind: 'easter', offsetDays: 1 }, cantons: WITHOUT_TI_VS },
  { name: 'Tag der Arbeit', rule: { kind: 'fixed', month: 5, day: 1 }, cantons: ['BS', 'JU', 'NE', 'SH', 'SO', 'TG', 'TI', 'ZG', 'AG'] },
  { name: 'Auffahrt', rule: { kind: 'easter', offsetDays: 39 }, cantons: ALL_CANTONS },
  { name: 'Pfingstmontag', rule: { kind: 'easter', offsetDays: 50 }, cantons: WITHOUT_TI_VS },
  {
    name: 'Fronleichnam',
    rule: { kind: 'easter', offsetDays: 60 },
    cantons: ['LU', 'UR', 'SZ', 'OW', 'NW', 'ZG', 'FR', 'SO', 'AI', 'TI', 'VS', 'JU'],
  },
  { name: 'Nationalfeiertag', rule: { kind: 'fixed', month: 8, day: 1 }, cantons: ALL_CANTONS },
  {
    name: 'Mariä Himmelfahrt',
    rule: { kind: 'fixed', month: 8, day: 15 },
    cantons: ['LU', 'UR', 'SZ', 'OW', 'NW', 'ZG', 'FR', 'SO', 'AI', 'TI', 'VS', 'JU'],
  },
  {
    name: 'Jeûne genevois',
    rule: { kind: 'afterNthSundayOfMonth', month: 9, n: 1, offsetDays: 4 },
    cantons: ['GE'],
  },
  {
    name: 'Lundi du Jeûne',
    rule: { kind: 'afterNthSundayOfMonth', month: 9, n: 3, offsetDays: 1 },
    cantons: ['VD'],
  },
  {
    name: 'Allerheiligen',
    rule: { kind: 'fixed', month: 11, day: 1 },
    cantons: ['LU', 'UR', 'SZ', 'OW', 'NW', 'ZG', 'FR', 'SO', 'AI', 'TI', 'VS', 'JU', 'GR', 'AG', 'SG'],
  },
  {
    name: 'Mariä Empfängnis',
    rule: { kind: 'fixed', month: 12, day: 8 },
    cantons: ['LU', 'UR', 'SZ', 'OW', 'NW', 'ZG', 'FR', 'SO', 'AI', 'TI', 'VS', 'JU'],
  },
  { name: 'Weihnachten', rule: { kind: 'fixed', month: 12, day: 25 }, cantons: ALL_CANTONS },
  {
    name: 'Stephanstag',
    rule: { kind: 'fixed', month: 12, day: 26 },
    cantons: ALL_CANTONS.filter((c) => c !== 'GE' && c !== 'VD' && c !== 'NE' && c !== 'TI' && c !== 'VS'),
  },
  { name: 'Republikfeiertag', rule: { kind: 'fixed', month: 3, day: 1 }, cantons: ['NE'] },
];

function easterSunday(year: number): IsoDate {
  // Anonymous Gregorian algorithm (Meeus/Jones/Butcher).
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return fromUtcDate(new Date(Date.UTC(year, month - 1, day)));
}

function nthWeekdayOfMonth(year: number, month: number, weekday: WeekdayIndex, n: number): IsoDate {
  const first = fromUtcDate(new Date(Date.UTC(year, month - 1, 1)));
  const delta = (weekday - weekdayOf(first) + 7) % 7;
  return addDays(first, delta + (n - 1) * 7);
}

function resolveRule(rule: Rule, year: number): IsoDate {
  switch (rule.kind) {
    case 'fixed':
      return fromUtcDate(new Date(Date.UTC(year, rule.month - 1, rule.day)));
    case 'easter':
      return addDays(easterSunday(year), rule.offsetDays);
    case 'nthWeekdayOfMonth':
      return nthWeekdayOfMonth(year, rule.month, rule.weekday, rule.n);
    case 'afterNthSundayOfMonth':
      return addDays(nthWeekdayOfMonth(year, rule.month, SUNDAY, rule.n), rule.offsetDays);
  }
}

/** Every holiday observed in `canton` during `year`, sorted by date. */
export function holidaysForCanton(canton: CantonCode, year: number): Holiday[] {
  return HOLIDAY_DEFS
    .filter((def) => def.cantons.includes(canton))
    .map((def) => ({ date: resolveRule(def.rule, year), name: def.name }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}
