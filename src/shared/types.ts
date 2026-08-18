/** Calendar date, 'YYYY-MM-DD'. */
export type IsoDate = string;

/** Time of day, 'HH:MM', 24-hour, zero-padded. */
export type TimeOfDay = string;

/** Never carries password data — `shared/` is imported by the client too. */
export interface AuthUser {
  id: number;
  email: string;
}

export const DAY_TYPES = ['normal', 'vacation', 'sick', 'holiday'] as const;
export type DayType = (typeof DAY_TYPES)[number];

/**
 * 0 = Monday … 6 = Sunday.
 *
 * Deliberately NOT `Date.prototype.getUTCDay()`, which is 0 = Sunday. Mixing the
 * two conventions is the single likeliest bug in this codebase, so every weekday
 * index in the app goes through `weekdayOf()`.
 */
export type WeekdayIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/** Mon..Sun. */
export type ByWeekday<T> = readonly [T, T, T, T, T, T, T];

/** One arrival/leave/break span within a normal day — e.g. an office morning and a home-office evening. */
export interface TimeBlock {
  arrival: TimeOfDay;
  leave: TimeOfDay;
  breakMinutes: number;
}

export interface TimeEntry {
  date: IsoDate;
  dayType: DayType;
  /** Empty for every non-`normal` day type; one or more for `normal`. */
  blocks: TimeBlock[];
  note: string | null;
  updatedAt: string;
}

export type TimeEntryInput = Omit<TimeEntry, 'date' | 'updatedAt'>;

export interface Settings {
  /**
   * Mon..Sun, in minutes. Authoritative for every calculation.
   * A target of 0 means "day off" — weekend or not.
   */
  targetMinutesByWeekday: ByWeekday<number>;
  /**
   * Workload inputs. Remembered so the Settings screen can redisplay and
   * recompute; never read by any calculation.
   */
  fullTimeWeeklyMinutes: number;
  /** Tenths of a percent, so 80.0% is stored as 800. Never a float. */
  workloadPercentX10: number;
  updatedAt: string;
}

export type SettingsInput = Omit<Settings, 'updatedAt'>;

export interface DaySummary {
  date: IsoDate;
  weekday: WeekdayIndex;
  /** null when no entry exists for this date. */
  dayType: DayType | null;
  hasEntry: boolean;
  /** 0 when there is no entry. */
  workedMinutes: number;
  /** The weekday's target, entry or not. 0 means it is a day off. */
  targetMinutes: number;
  /** 0 when there is no entry — an untracked day is not a shortfall. */
  balanceMinutes: number;
  /** A past-or-today day with a nonzero target and no entry. */
  isMissingWorkday: boolean;
  entry: TimeEntry | null;
}

export interface Totals {
  workedMinutes: number;
  /** Summed over days WITH an entry — the denominator the balance is measured against. */
  targetMinutesTracked: number;
  /** Summed over ALL days in the range — what the range demands of you. */
  targetMinutesScheduled: number;
  /** workedMinutes − targetMinutesTracked. */
  balanceMinutes: number;
  trackedDayCount: number;
  missingWorkdays: IsoDate[];
  dayTypeCounts: Record<DayType, number>;
}

export interface Bucket {
  /** '2026-W34' or '2026-08'. */
  key: string;
  label: string;
  from: IsoDate;
  to: IsoDate;
  totals: Totals;
  days: DaySummary[];
}

export type GroupBy = 'week' | 'month' | 'none';

export interface RangeSummary {
  from: IsoDate;
  to: IsoDate;
  today: IsoDate;
  totals: Totals;
  buckets: Bucket[];
  days: DaySummary[];
  /** Balance across every entry ever recorded up to and including `to`. */
  cumulativeBalanceMinutes: number;
}
