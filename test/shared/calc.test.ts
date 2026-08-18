import { describe, expect, it } from 'vitest';
import {
  aggregateTotals, balanceMinutesFor, buildRangeSummary, cumulativeBalance,
  distributeWeeklyTarget, isDayOff, summarizeDay, targetMinutesFor, weeklyTargetMinutes,
  workedMinutesFor,
} from '@shared/calc.ts';
import type { ByWeekday, DayType, Settings, TimeEntry } from '@shared/types.ts';

// Mon 2026-08-17 .. Sun 2026-08-23 is ISO week 2026-W34, used throughout.
const MON = '2026-08-17';
const TUE = '2026-08-18';
const WED = '2026-08-19';
const THU = '2026-08-20';
const FRI = '2026-08-21';
const SAT = '2026-08-22';
const SUN = '2026-08-23';

function settings(targets: ByWeekday<number>, extra: Partial<Settings> = {}): Settings {
  return {
    targetMinutesByWeekday: targets,
    fullTimeWeeklyMinutes: 2520,
    workloadPercentX10: 1000,
    updatedAt: '2026-08-01T00:00:00Z',
    ...extra,
  };
}

/** 8h24m Mon-Fri, weekend off — the app's default. */
const fullTime = settings([504, 504, 504, 504, 504, 0, 0]);
/** 80%: same daily hours, Friday off. */
const partTime = settings([504, 504, 504, 504, 0, 0, 0], { workloadPercentX10: 800 });

function entry(date: string, blockOver: Partial<{ arrival: string; leave: string; breakMinutes: number }> = {}): TimeEntry {
  return {
    date,
    dayType: 'normal',
    blocks: [{ arrival: '08:00', leave: '17:00', breakMinutes: 0, ...blockOver }],
    note: null,
    updatedAt: '2026-08-18T10:00:00Z',
  };
}

function specialDay(date: string, dayType: DayType): TimeEntry {
  return { date, dayType, blocks: [], note: null, updatedAt: '2026-08-18T10:00:00Z' };
}

describe('workedMinutesFor', () => {
  it('subtracts breaks from the span', () => {
    expect(workedMinutesFor(entry(MON, { leave: '17:15', breakMinutes: 45 }), fullTime)).toBe(510);
  });

  it('handles a break of zero', () => {
    expect(workedMinutesFor(entry(MON, { leave: '17:15', breakMinutes: 0 }), fullTime)).toBe(555);
  });

  it('returns a raw negative when breaks exceed the span, for the live preview', () => {
    expect(
      workedMinutesFor(entry(MON, { arrival: '09:00', leave: '17:00', breakMinutes: 600 }), fullTime),
    ).toBe(-120);
  });

  it('counts a special day as that weekday target, so the balance is zero', () => {
    const vacation = specialDay(TUE, 'vacation');
    expect(workedMinutesFor(vacation, fullTime)).toBe(504);
    expect(balanceMinutesFor(vacation, fullTime)).toBe(0);
  });

  it('counts a holiday on a zero-target day as nothing', () => {
    const holiday = specialDay(SAT, 'holiday');
    expect(workedMinutesFor(holiday, fullTime)).toBe(0);
    expect(balanceMinutesFor(holiday, fullTime)).toBe(0);
  });

  it('counts vacation on a mid-week day off as nothing', () => {
    // Taking vacation on a Friday you never work shouldn't spend a day's hours.
    const vacation = specialDay(FRI, 'vacation');
    expect(workedMinutesFor(vacation, partTime)).toBe(0);
    expect(balanceMinutesFor(vacation, partTime)).toBe(0);
  });

  it('sums several blocks on the same day (e.g. office morning + home-office evening)', () => {
    const split: TimeEntry = {
      date: MON,
      dayType: 'normal',
      blocks: [
        { arrival: '08:00', leave: '12:00', breakMinutes: 0 }, // 240
        { arrival: '20:00', leave: '21:00', breakMinutes: 0 }, // 60
      ],
      note: null,
      updatedAt: '2026-08-18T10:00:00Z',
    };
    expect(workedMinutesFor(split, fullTime)).toBe(300);
  });

  it('ignores an unparseable (still-being-typed) block rather than aborting the sum', () => {
    const partial: TimeEntry = {
      date: MON,
      dayType: 'normal',
      blocks: [
        { arrival: '08:00', leave: '12:00', breakMinutes: 0 }, // 240
        { arrival: '', leave: '', breakMinutes: 0 }, // still empty — contributes 0, not NaN
      ],
      note: null,
      updatedAt: '2026-08-18T10:00:00Z',
    };
    expect(workedMinutesFor(partial, fullTime)).toBe(240);
  });
});

describe('days off', () => {
  it('treats any zero-target weekday as a day off, weekend or not', () => {
    expect(isDayOff(FRI, partTime)).toBe(true);
    expect(isDayOff(FRI, fullTime)).toBe(false);
    expect(isDayOff(SUN, fullTime)).toBe(true);
  });

  it('books hours worked on a day off as pure overtime', () => {
    const worked = entry(FRI, { arrival: '09:00', leave: '17:00', breakMinutes: 0 });
    const day = summarizeDay(FRI, worked, partTime, SUN);
    expect(day.workedMinutes).toBe(480);
    expect(day.targetMinutes).toBe(0);
    expect(day.balanceMinutes).toBe(480);
  });

  it('never flags a day off as untracked', () => {
    const day = summarizeDay(FRI, null, partTime, SUN);
    expect(day.isMissingWorkday).toBe(false);
  });
});

describe('part-time distribution', () => {
  it('scales a full-time week by the workload percentage', () => {
    expect(weeklyTargetMinutes(2520, 1000)).toBe(2520);
    expect(weeklyTargetMinutes(2520, 800)).toBe(2016); // 42h at 80% = 33h36m
    expect(weeklyTargetMinutes(2400, 500)).toBe(1200);
  });

  it('splits evenly when it divides cleanly', () => {
    expect(distributeWeeklyTarget(2016, [true, true, true, true, false, false, false]))
      .toEqual([504, 504, 504, 504, 0, 0, 0]);
  });

  it('hands the remainder to the earliest days so the sum stays exact', () => {
    const spread = distributeWeeklyTarget(2016, [true, true, true, true, true, false, false]);
    expect(spread).toEqual([404, 403, 403, 403, 403, 0, 0]);
    expect(spread.reduce((a, b) => a + b, 0)).toBe(2016);
  });

  it('always sums to the requested weekly total', () => {
    for (const weekly of [2016, 2520, 1, 2, 1999, 2521]) {
      for (const count of [1, 2, 3, 4, 5, 6, 7]) {
        const mask = Array.from({ length: 7 }, (_, i) => i < count);
        const spread = distributeWeeklyTarget(weekly, mask);
        expect(spread.reduce((a, b) => a + b, 0)).toBe(weekly);
      }
    }
  });

  it('does not divide by zero when no day is a working day', () => {
    expect(distributeWeeklyTarget(2016, [false, false, false, false, false, false, false]))
      .toEqual([0, 0, 0, 0, 0, 0, 0]);
  });

  it('can place the day off mid-week', () => {
    // 80%, Wednesday off.
    const spread = distributeWeeklyTarget(2016, [true, true, false, true, true, false, false]);
    expect(spread).toEqual([504, 504, 0, 504, 504, 0, 0]);
    expect(targetMinutesFor(WED, settings(spread))).toBe(0);
  });
});

describe('summarizeDay', () => {
  it('gives an untracked day a zero balance rather than a shortfall', () => {
    const day = summarizeDay(WED, null, fullTime, FRI);
    expect(day.hasEntry).toBe(false);
    expect(day.workedMinutes).toBe(0);
    expect(day.targetMinutes).toBe(504);
    expect(day.balanceMinutes).toBe(0);
    expect(day.isMissingWorkday).toBe(true);
  });

  it('never flags a future day as untracked', () => {
    expect(summarizeDay(FRI, null, fullTime, WED).isMissingWorkday).toBe(false);
  });

  it('flags today itself once it has passed unlogged', () => {
    expect(summarizeDay(WED, null, fullTime, WED).isMissingWorkday).toBe(true);
  });
});

describe('aggregateTotals', () => {
  it('measures the balance against tracked days but reports the full schedule', () => {
    const entries = [MON, TUE, WED, THU].map((d) => specialDay(d, 'vacation'));
    const summary = buildRangeSummary({
      from: MON, to: SUN, entries, settings: fullTime, today: FRI,
      groupBy: 'none', cumulativeBalanceMinutes: 0,
    });

    expect(summary.totals.balanceMinutes).toBe(0);
    expect(summary.totals.targetMinutesTracked).toBe(2016);
    expect(summary.totals.targetMinutesScheduled).toBe(2520);
    expect(summary.totals.trackedDayCount).toBe(4);
    expect(summary.totals.missingWorkdays).toEqual([FRI]);
  });

  it('reports no missing days when today is mid-week', () => {
    const entries = [MON, TUE].map((d) => specialDay(d, 'vacation'));
    const summary = buildRangeSummary({
      from: MON, to: SUN, entries, settings: fullTime, today: TUE,
      groupBy: 'none', cumulativeBalanceMinutes: 0,
    });
    expect(summary.totals.missingWorkdays).toEqual([]);
  });

  it('counts day types', () => {
    const days = [
      summarizeDay(MON, entry(MON), fullTime, SUN),
      summarizeDay(TUE, specialDay(TUE, 'vacation'), fullTime, SUN),
      summarizeDay(WED, specialDay(WED, 'sick'), fullTime, SUN),
    ];
    const totals = aggregateTotals(days);
    expect(totals.dayTypeCounts).toEqual({ normal: 1, vacation: 1, sick: 1, holiday: 0 });
  });
});

describe('cumulativeBalance', () => {
  it('sums signed balances across every entry', () => {
    const entries = [
      entry(MON, { leave: '17:24' }), // 564 worked, +60
      entry(TUE, { leave: '16:00' }), // 480 worked, -24
    ];
    expect(cumulativeBalance(entries, fullTime)).toBe(36);
  });
});

describe('buildRangeSummary bucketing', () => {
  it('clips week buckets to the month and keeps the totals consistent', () => {
    // August 2026: the 1st is a Saturday, the 31st a Monday -> 6 ISO weeks.
    const summary = buildRangeSummary({
      from: '2026-08-01', to: '2026-08-31',
      entries: [entry(MON, { leave: '17:24' })],
      settings: fullTime, today: '2026-08-31',
      groupBy: 'week', cumulativeBalanceMinutes: 0,
    });

    expect(summary.buckets).toHaveLength(6);
    expect(summary.buckets[0]!.from).toBe('2026-08-01'); // clipped, not 2026-07-27
    expect(summary.buckets[0]!.to).toBe('2026-08-02');
    expect(summary.buckets[5]!.from).toBe('2026-08-31');
    expect(summary.buckets[5]!.to).toBe('2026-08-31'); // clipped, not 2026-09-06

    const bucketWorked = summary.buckets.reduce((s, b) => s + b.totals.workedMinutes, 0);
    expect(bucketWorked).toBe(summary.totals.workedMinutes);
    const bucketDays = summary.buckets.reduce((s, b) => s + b.days.length, 0);
    expect(bucketDays).toBe(summary.days.length);
  });

  it('buckets by month across a boundary', () => {
    const summary = buildRangeSummary({
      from: '2026-07-28', to: '2026-08-03', entries: [],
      settings: fullTime, today: '2026-08-03',
      groupBy: 'month', cumulativeBalanceMinutes: 0,
    });
    expect(summary.buckets.map((b) => b.key)).toEqual(['2026-07', '2026-08']);
    expect(summary.buckets[0]!.from).toBe('2026-07-28');
    expect(summary.buckets[1]!.to).toBe('2026-08-03');
  });

  it('emits no buckets when grouping is off', () => {
    const summary = buildRangeSummary({
      from: MON, to: SUN, entries: [], settings: fullTime, today: SUN,
      groupBy: 'none', cumulativeBalanceMinutes: 0,
    });
    expect(summary.buckets).toEqual([]);
    expect(summary.days).toHaveLength(7);
  });
});
