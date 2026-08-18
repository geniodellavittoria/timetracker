import { describe, expect, it } from 'vitest';
import {
  formatDecimalHours, formatDuration, formatTimeOfDay, hoursToMinutes,
  minutesToHoursValue, parseTimeOfDay,
} from '@shared/time.ts';

describe('parseTimeOfDay', () => {
  it('parses well-formed 24h times', () => {
    expect(parseTimeOfDay('08:30')).toBe(510);
    expect(parseTimeOfDay('00:00')).toBe(0);
    expect(parseTimeOfDay('23:59')).toBe(1439);
  });

  it.each(['8:30', '24:00', '08:60', '08:30:00', '', '  ', 'nope', '0830'])(
    'rejects %j',
    (value) => {
      expect(parseTimeOfDay(value)).toBeNull();
    },
  );

  it('rejects non-strings', () => {
    expect(parseTimeOfDay(null)).toBeNull();
    expect(parseTimeOfDay(510)).toBeNull();
  });
});

describe('formatTimeOfDay', () => {
  it('round-trips with the parser', () => {
    for (const m of [0, 1, 510, 1020, 1439]) {
      expect(parseTimeOfDay(formatTimeOfDay(m))).toBe(m);
    }
  });
});

describe('formatDuration', () => {
  it('formats plain durations', () => {
    expect(formatDuration(510)).toBe('8 Std 30 Min');
    expect(formatDuration(0)).toBe('0 Std 00 Min');
    expect(formatDuration(-75)).toBe('−1 Std 15 Min');
  });

  it('formats signed durations with an explicit zero', () => {
    expect(formatDuration(0, { signed: true })).toBe('±0 Std 00 Min');
    expect(formatDuration(75, { signed: true })).toBe('+1 Std 15 Min');
    expect(formatDuration(-75, { signed: true })).toBe('−1 Std 15 Min');
  });
});

describe('decimal hours', () => {
  it('formats for payroll', () => {
    expect(formatDecimalHours(462)).toBe('7.70');
    expect(formatDecimalHours(504)).toBe('8.40');
  });

  it('converts hours to whole minutes without drift', () => {
    expect(hoursToMinutes(8.4)).toBe(504);
    expect(hoursToMinutes(8.25)).toBe(495);
    expect(minutesToHoursValue(504)).toBe(8.4);
  });
});
