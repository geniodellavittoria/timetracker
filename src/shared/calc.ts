import {
  addDays, compareDates, eachDateInRange, endOfIsoWeek, endOfMonth, formatMonthLabel,
  formatWeekLabel, isoWeekKey, monthKey, weekdayOf,
} from './dates.ts';
import { parseTimeOfDay } from './time.ts';
import { DAY_TYPES } from './types.ts';
import type {
  Bucket, ByWeekday, DaySummary, DayType, GroupBy, IsoDate, RangeSummary, Settings,
  TimeEntry, Totals,
} from './types.ts';

/** The weekday target for a date. 0 means the date is a day off. */
export function targetMinutesFor(date: IsoDate, settings: Settings): number {
  return settings.targetMinutesByWeekday[weekdayOf(date)] ?? 0;
}

/**
 * A day off is simply a weekday whose target is 0. Weekends get no special
 * treatment anywhere in this module, which is exactly what lets a part-time
 * schedule put the day off mid-week.
 */
export function isDayOff(date: IsoDate, settings: Settings): boolean {
  return targetMinutesFor(date, settings) === 0;
}

/**
 * Worked minutes for an entry — the sum across every block on a `normal` day
 * (one office morning plus a home-office evening is two blocks, added
 * together).
 *
 * Each block's RAW span minus its break is used, which may be negative while
 * the user is still typing a block. Returning the raw number lets the live
 * preview show '−0h 30m' instead of a misleading 0 for that block;
 * `validateEntryInput` is what blocks the save. A block that isn't parseable
 * yet (still empty, mid-edit) contributes 0 rather than aborting the sum, so
 * finished blocks keep counting while another one is still being typed.
 *
 * Every other day type counts as that weekday's target, so its balance is
 * exactly 0 — a vacation day neither earns nor costs overtime. On a day off
 * (target 0) it contributes nothing, which is correct: taking vacation on a day
 * you don't work shouldn't consume a day's worth of hours.
 */
export function workedMinutesFor(entry: TimeEntry, settings: Settings): number {
  if (entry.dayType !== 'normal') return targetMinutesFor(entry.date, settings);
  return entry.blocks.reduce((sum, block) => {
    const arrival = parseTimeOfDay(block.arrival);
    const leave = parseTimeOfDay(block.leave);
    if (arrival === null || leave === null) return sum;
    return sum + (leave - arrival - (block.breakMinutes ?? 0));
  }, 0);
}

export function balanceMinutesFor(entry: TimeEntry, settings: Settings): number {
  return workedMinutesFor(entry, settings) - targetMinutesFor(entry.date, settings);
}

/**
 * e.g. weeklyTargetMinutes(2520, 800) === 2016 — a 42h week at 80%.
 * The divisor is 1000 because the percentage is stored in tenths (100% === 1000).
 */
export function weeklyTargetMinutes(fullTimeWeeklyMinutes: number, workloadPercentX10: number): number {
  return Math.round((fullTimeWeeklyMinutes * workloadPercentX10) / 1000);
}

/**
 * Split a weekly target across the chosen weekdays.
 *
 * The sum is always exactly `weeklyMinutes`: any remainder is handed out one
 * minute at a time to the earliest working days, so 2016 over five days gives
 * [404, 403, 403, 403, 403] rather than five 403s that quietly lose a minute.
 */
export function distributeWeeklyTarget(
  weeklyMinutes: number,
  worksOnWeekday: readonly boolean[],
): ByWeekday<number> {
  const out: number[] = [0, 0, 0, 0, 0, 0, 0];
  const workingDays: number[] = [];
  for (let i = 0; i < 7; i += 1) if (worksOnWeekday[i]) workingDays.push(i);
  if (workingDays.length === 0) return out as unknown as ByWeekday<number>;

  const total = Math.max(0, Math.round(weeklyMinutes));
  const base = Math.floor(total / workingDays.length);
  let remainder = total - base * workingDays.length;
  for (const day of workingDays) {
    out[day] = base + (remainder > 0 ? 1 : 0);
    if (remainder > 0) remainder -= 1;
  }
  return out as unknown as ByWeekday<number>;
}

export function summarizeDay(
  date: IsoDate,
  entry: TimeEntry | null,
  settings: Settings,
  today: IsoDate,
): DaySummary {
  const targetMinutes = targetMinutesFor(date, settings);
  const hasEntry = entry !== null;
  const workedMinutes = entry ? workedMinutesFor(entry, settings) : 0;

  return {
    date,
    weekday: weekdayOf(date),
    dayType: entry?.dayType ?? null,
    hasEntry,
    workedMinutes,
    targetMinutes,
    // An untracked day is not a shortfall — see isMissingWorkday instead.
    balanceMinutes: hasEntry ? workedMinutes - targetMinutes : 0,
    // A day off (target 0) is never "missing", and neither is a future date.
    isMissingWorkday: !hasEntry && targetMinutes > 0 && compareDates(date, today) <= 0,
    entry,
  };
}

export function aggregateTotals(days: readonly DaySummary[]): Totals {
  const dayTypeCounts = Object.fromEntries(DAY_TYPES.map((t) => [t, 0])) as Record<DayType, number>;
  const totals: Totals = {
    workedMinutes: 0,
    targetMinutesTracked: 0,
    targetMinutesScheduled: 0,
    balanceMinutes: 0,
    trackedDayCount: 0,
    missingWorkdays: [],
    dayTypeCounts,
  };

  for (const day of days) {
    totals.targetMinutesScheduled += day.targetMinutes;
    if (day.hasEntry) {
      totals.workedMinutes += day.workedMinutes;
      totals.targetMinutesTracked += day.targetMinutes;
      totals.trackedDayCount += 1;
      if (day.dayType) dayTypeCounts[day.dayType] += 1;
    }
    if (day.isMissingWorkday) totals.missingWorkdays.push(day.date);
  }

  totals.balanceMinutes = totals.workedMinutes - totals.targetMinutesTracked;
  return totals;
}

/** Balance across every entry given, regardless of range. */
export function cumulativeBalance(entries: readonly TimeEntry[], settings: Settings): number {
  return entries.reduce((sum, entry) => sum + balanceMinutesFor(entry, settings), 0);
}

export function buildRangeSummary(args: {
  from: IsoDate;
  to: IsoDate;
  entries: readonly TimeEntry[];
  settings: Settings;
  today: IsoDate;
  groupBy: GroupBy;
  cumulativeBalanceMinutes: number;
}): RangeSummary {
  const { from, to, entries, settings, today, groupBy, cumulativeBalanceMinutes } = args;

  const byDate = new Map(entries.map((e) => [e.date, e]));
  const days = eachDateInRange(from, to).map((date) =>
    summarizeDay(date, byDate.get(date) ?? null, settings, today),
  );

  return {
    from,
    to,
    today,
    totals: aggregateTotals(days),
    buckets: groupBy === 'none' ? [] : bucketDays(days, groupBy, from, to),
    days,
    cumulativeBalanceMinutes,
  };
}

/**
 * Group days into ISO weeks or calendar months. Buckets are clipped to the
 * requested range, so a month view's first and last weeks are partial and their
 * from/to reflect that rather than spilling outside the month.
 */
function bucketDays(
  days: readonly DaySummary[],
  groupBy: Exclude<GroupBy, 'none'>,
  rangeFrom: IsoDate,
  rangeTo: IsoDate,
): Bucket[] {
  const order: string[] = [];
  const grouped = new Map<string, DaySummary[]>();

  for (const day of days) {
    const key = groupBy === 'week' ? isoWeekKey(day.date) : monthKey(day.date);
    let list = grouped.get(key);
    if (!list) {
      list = [];
      grouped.set(key, list);
      order.push(key);
    }
    list.push(day);
  }

  return order.map((key) => {
    const bucketDaysList = grouped.get(key)!;
    const first = bucketDaysList[0]!.date;
    const last = bucketDaysList[bucketDaysList.length - 1]!.date;
    const naturalEnd = groupBy === 'week' ? endOfIsoWeek(first) : endOfMonth(first);
    const naturalStart = groupBy === 'week' ? addDays(naturalEnd, -6) : `${key}-01`;

    return {
      key,
      label: groupBy === 'week' ? formatWeekLabel(key) : formatMonthLabel(key),
      from: max(naturalStart, rangeFrom, first),
      to: min(naturalEnd, rangeTo, last),
      totals: aggregateTotals(bucketDaysList),
      days: bucketDaysList,
    };
  });
}

function max(...values: IsoDate[]): IsoDate {
  return values.reduce((a, b) => (a >= b ? a : b));
}

function min(...values: IsoDate[]): IsoDate {
  return values.reduce((a, b) => (a <= b ? a : b));
}
