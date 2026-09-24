import { describe, expect, it } from 'vitest';
import { formatVacationYear, summarizeVacation, vacationYearOf, vacationYearRange } from '@shared/vacation.ts';
import type { ByWeekday, DayType, Settings, TimeEntry, VacationAllowance } from '@shared/types.ts';

function period(effectiveFrom: string, targets: ByWeekday<number>, id = 1) {
  return {
    id,
    effectiveFrom,
    targetMinutesByWeekday: targets,
    fullTimeWeeklyMinutes: 2520,
    workloadPercentX100: 10000,
    updatedAt: '2026-08-01T00:00:00Z',
  };
}

const fullTime: Settings = [period('2000-01-01', [504, 504, 504, 504, 504, 0, 0])];

function day(date: string, dayType: DayType = 'vacation'): TimeEntry {
  return {
    date,
    dayType,
    blocks: dayType === 'normal' ? [{ arrival: '08:00', leave: '17:00', breakMinutes: 0 }] : [],
    note: null,
    updatedAt: '2026-08-01T00:00:00Z',
  };
}

const allowance = (days: number, carryOverDays = 0): VacationAllowance =>
  ({ year: 2026, days, carryOverDays, updatedAt: '2026-08-01T00:00:00Z' });

describe('Ferien year', () => {
  it('starts on 1 August', () => {
    expect(vacationYearOf('2026-07-31')).toBe(2025);
    expect(vacationYearOf('2026-08-01')).toBe(2026);
    expect(vacationYearOf('2027-01-15')).toBe(2026);
  });

  it('spans 1 Aug to 31 Jul', () => {
    expect(vacationYearRange(2026)).toEqual({ from: '2026-08-01', to: '2027-07-31' });
    expect(formatVacationYear(2026)).toBe('2026/27');
    expect(formatVacationYear(2099)).toBe('2099/00');
  });
});

describe('summarizeVacation', () => {
  it('splits taken and planned at today, inclusive', () => {
    const s = summarizeVacation({
      year: 2026,
      allowance: allowance(25),
      // Mon 2026-08-17 … Wed 2026-08-19.
      entries: [day('2026-08-17'), day('2026-08-18'), day('2026-08-19')],
      settings: fullTime,
      today: '2026-08-18',
    });
    expect(s).toMatchObject({ availableDays: 25, takenDays: 2, plannedDays: 1, remainingDays: 22 });
    expect(s.takenDates).toEqual(['2026-08-17', '2026-08-18']);
    expect(s.plannedDates).toEqual(['2026-08-19']);
  });

  it('ignores Ferien on days without a target, other day types and other years', () => {
    const s = summarizeVacation({
      year: 2026,
      allowance: allowance(25),
      entries: [
        day('2026-08-22'), // Saturday
        day('2026-08-20', 'holiday'),
        day('2026-08-21', 'normal'),
        day('2026-07-31'), // previous Ferien year
        day('2027-08-02'), // next Ferien year
      ],
      settings: fullTime,
      today: '2026-09-01',
    });
    expect(s.takenDays + s.plannedDays).toBe(0);
  });

  it('follows a Pensum change within the year', () => {
    // Fridays off from 2026-09-01 on.
    const settings: Settings = [
      period('2000-01-01', [504, 504, 504, 504, 504, 0, 0], 1),
      period('2026-09-01', [504, 504, 504, 504, 0, 0, 0], 2),
    ];
    const s = summarizeVacation({
      year: 2026,
      allowance: allowance(20),
      entries: [day('2026-08-21'), day('2026-09-04')], // both Fridays
      settings,
      today: '2026-10-01',
    });
    expect(s.takenDates).toEqual(['2026-08-21']);
  });

  it('adds the carry-over and goes negative when overbooked', () => {
    const s = summarizeVacation({
      year: 2026,
      allowance: allowance(1, 0.5),
      entries: [day('2026-08-17'), day('2026-08-18')],
      settings: fullTime,
      today: '2026-08-01',
    });
    expect(s).toMatchObject({ availableDays: 1.5, takenDays: 0, plannedDays: 2, remainingDays: -0.5 });
  });

  it('counts against 0 without an allowance', () => {
    const s = summarizeVacation({ year: 2026, allowance: null, entries: [day('2026-08-17')], settings: fullTime, today: '2026-08-17' });
    expect(s).toMatchObject({ allowance: null, availableDays: 0, takenDays: 1, remainingDays: -1 });
  });
});
