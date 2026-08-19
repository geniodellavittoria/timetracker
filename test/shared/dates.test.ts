import { describe, expect, it } from 'vitest';
import {
  addDays, addMonths, addWeeks, eachDateInRange, endOfIsoWeek, endOfMonth, isoWeekKey,
  isoWeekKeyToRange, isValidIsoDate, isValidIsoWeekKey, mostRecentAugustFirst, startOfIsoWeek,
  todayIsoDateLocal, weekdayOf,
} from '@shared/dates.ts';

describe('mostRecentAugustFirst', () => {
  it('returns this year\'s Aug 1 once today is on or after it', () => {
    expect(mostRecentAugustFirst('2026-08-01')).toBe('2026-08-01');
    expect(mostRecentAugustFirst('2026-08-19')).toBe('2026-08-01');
    expect(mostRecentAugustFirst('2026-12-31')).toBe('2026-08-01');
  });

  it('returns last year\'s Aug 1 before it', () => {
    expect(mostRecentAugustFirst('2026-07-31')).toBe('2025-08-01');
    expect(mostRecentAugustFirst('2026-01-01')).toBe('2025-08-01');
  });
});

describe('isValidIsoDate', () => {
  it('accepts real dates and rejects impossible ones', () => {
    expect(isValidIsoDate('2026-08-18')).toBe(true);
    expect(isValidIsoDate('2024-02-29')).toBe(true);
    expect(isValidIsoDate('2026-02-30')).toBe(false);
    expect(isValidIsoDate('2026-02-29')).toBe(false);
    expect(isValidIsoDate('2026-13-01')).toBe(false);
    expect(isValidIsoDate('26-08-18')).toBe(false);
  });
});

describe('weekdayOf', () => {
  it('uses the Monday=0 convention, not getUTCDay', () => {
    expect(weekdayOf('2026-08-17')).toBe(0); // Monday
    expect(weekdayOf('2026-08-18')).toBe(1); // Tuesday
    expect(weekdayOf('2026-08-22')).toBe(5); // Saturday
    expect(weekdayOf('2026-08-23')).toBe(6); // Sunday
  });
});

describe('ISO weeks', () => {
  it.each([
    ['2026-01-01', '2026-W01'],
    ['2027-01-01', '2026-W53'],
    ['2021-01-01', '2020-W53'],
    ['2024-12-30', '2025-W01'],
    ['2026-08-18', '2026-W34'],
  ])('isoWeekKey(%s) === %s', (date, key) => {
    expect(isoWeekKey(date)).toBe(key);
  });

  it('bounds the week Monday to Sunday', () => {
    expect(startOfIsoWeek('2026-08-18')).toBe('2026-08-17');
    expect(endOfIsoWeek('2026-08-18')).toBe('2026-08-23');
  });

  it('round-trips a week key through its date range', () => {
    for (const key of ['2026-W01', '2026-W34', '2026-W53', '2025-W01']) {
      const { from, to } = isoWeekKeyToRange(key);
      expect(isoWeekKey(from)).toBe(key);
      expect(isoWeekKey(to)).toBe(key);
      expect(addDays(from, 6)).toBe(to);
    }
  });

  it('rejects a 53rd week in a 52-week year', () => {
    expect(isValidIsoWeekKey('2026-W53')).toBe(true);
    expect(isValidIsoWeekKey('2025-W53')).toBe(false);
    expect(isValidIsoWeekKey('2026-W54')).toBe(false);
  });

  it('steps across a year boundary without an off-by-one', () => {
    expect(addWeeks('2026-W53', 1)).toBe('2027-W01');
    expect(addWeeks('2027-W01', -1)).toBe('2026-W53');
  });
});

describe('months', () => {
  it('is leap-year aware', () => {
    expect(endOfMonth('2024-02-10')).toBe('2024-02-29');
    expect(endOfMonth('2026-02-10')).toBe('2026-02-28');
    expect(endOfMonth('2026-08-01')).toBe('2026-08-31');
  });

  it('steps across a year boundary', () => {
    expect(addMonths('2026-12', 1)).toBe('2027-01');
    expect(addMonths('2026-01', -1)).toBe('2025-12');
  });
});

describe('eachDateInRange', () => {
  it('is inclusive on both ends', () => {
    expect(eachDateInRange('2026-08-17', '2026-08-19')).toEqual([
      '2026-08-17', '2026-08-18', '2026-08-19',
    ]);
  });

  /**
   * 2026-03-29 is the CET->CEST switch in Europe/Zurich. A local-time
   * implementation drops or duplicates a day here; this test is the reason
   * `npm run test:tz` exists, since it is vacuous under UTC.
   */
  it('survives a DST transition', () => {
    expect(eachDateInRange('2026-03-28', '2026-03-31')).toEqual([
      '2026-03-28', '2026-03-29', '2026-03-30', '2026-03-31',
    ]);
  });

  it('survives the autumn transition too', () => {
    expect(eachDateInRange('2026-10-24', '2026-10-26')).toEqual([
      '2026-10-24', '2026-10-25', '2026-10-26',
    ]);
  });
});

describe('todayIsoDateLocal', () => {
  it('reports the local wall-clock date, not the UTC one', () => {
    // 2026-08-18 00:30 local. Under any timezone east of UTC, toISOString()
    // would report the 17th; the local getters must report the 18th.
    const localMidnightish = new Date(2026, 7, 18, 0, 30, 0);
    expect(todayIsoDateLocal(localMidnightish)).toBe('2026-08-18');
  });

  it('pads single-digit months and days', () => {
    expect(todayIsoDateLocal(new Date(2026, 0, 5, 12, 0, 0))).toBe('2026-01-05');
  });
});
