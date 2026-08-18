import { describe, expect, it } from 'vitest';
import { validateEntryInput, validateRange } from '@shared/validation.ts';
import type { TimeEntryInput } from '@shared/types.ts';

function input(over: Partial<TimeEntryInput> = {}): TimeEntryInput {
  return { dayType: 'normal', arrival: '08:00', leave: '17:00', breakMinutes: 0, note: null, ...over };
}

const codes = (i: TimeEntryInput) => validateEntryInput(i).map((x) => x.code);

describe('validateEntryInput', () => {
  it('accepts a well-formed normal day', () => {
    expect(validateEntryInput(input({ leave: '17:15', breakMinutes: 45 }))).toEqual([]);
  });

  it('rejects a leaving time equal to arrival', () => {
    expect(codes(input({ arrival: '09:00', leave: '09:00' }))).toEqual(['leave_not_after_arrival']);
  });

  it('rejects an overnight shift, documenting the deliberate limitation', () => {
    expect(codes(input({ arrival: '22:00', leave: '06:00' }))).toEqual(['leave_not_after_arrival']);
  });

  it('rejects breaks longer than the span', () => {
    expect(codes(input({ arrival: '09:00', leave: '17:00', breakMinutes: 600 })))
      .toEqual(['break_exceeds_span']);
  });

  it('accepts a break exactly equal to the span', () => {
    expect(validateEntryInput(input({ arrival: '09:00', leave: '17:00', breakMinutes: 480 }))).toEqual([]);
  });

  it('requires both times on a normal day', () => {
    expect(codes(input({ leave: null }))).toEqual(['times_required_for_normal_day']);
    expect(codes(input({ arrival: null }))).toEqual(['times_required_for_normal_day']);
  });

  it('rejects a malformed time', () => {
    expect(codes(input({ arrival: '8:00' }))).toEqual(['invalid_time']);
  });

  it('accepts special days with null times', () => {
    for (const dayType of ['vacation', 'sick', 'holiday'] as const) {
      expect(validateEntryInput(input({ dayType, arrival: null, leave: null, breakMinutes: null })))
        .toEqual([]);
    }
  });

  it('rejects a special day that carries times', () => {
    expect(codes(input({ dayType: 'vacation' }))).toEqual(['times_not_allowed_for_special_day']);
    expect(codes(input({ dayType: 'sick', arrival: null, leave: null, breakMinutes: 30 })))
      .toEqual(['times_not_allowed_for_special_day']);
  });
});

describe('validateRange', () => {
  it('accepts a sane range', () => {
    expect(validateRange('2026-08-01', '2026-08-31')).toEqual([]);
    expect(validateRange('2026-08-01', '2026-08-01')).toEqual([]);
  });

  it('rejects an inverted range', () => {
    expect(validateRange('2026-08-31', '2026-08-01').map((i) => i.code)).toEqual(['invalid_range']);
  });

  it('rejects malformed dates', () => {
    expect(validateRange('nope', '2026-08-01').map((i) => i.code)).toEqual(['invalid_date']);
    expect(validateRange('2026-08-01', '2026-02-30').map((i) => i.code)).toEqual(['invalid_date']);
  });

  it('caps the span so a bogus `from` cannot materialize a lifetime of days', () => {
    expect(validateRange('2026-01-01', '2026-12-31')).toEqual([]);         // 365
    expect(validateRange('0001-01-01', '2026-12-31').map((i) => i.code)).toEqual(['range_too_large']);
  });
});
