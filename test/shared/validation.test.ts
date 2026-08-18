import { describe, expect, it } from 'vitest';
import { emailSchema, passwordSchema, validateEntryInput, validateRange } from '@shared/validation.ts';
import type { TimeEntryInput } from '@shared/types.ts';

function normalDay(blockOver: Partial<{ arrival: string; leave: string; breakMinutes: number }> = {}): TimeEntryInput {
  return { dayType: 'normal', blocks: [{ arrival: '08:00', leave: '17:00', breakMinutes: 0, ...blockOver }], note: null };
}

function specialDay(dayType: 'vacation' | 'sick' | 'holiday', blocks: TimeEntryInput['blocks'] = []): TimeEntryInput {
  return { dayType, blocks, note: null } as TimeEntryInput;
}

const codes = (i: TimeEntryInput) => validateEntryInput(i).map((x) => x.code);

describe('validateEntryInput', () => {
  it('accepts a well-formed normal day', () => {
    expect(validateEntryInput(normalDay({ leave: '17:15', breakMinutes: 45 }))).toEqual([]);
  });

  it('rejects a leaving time equal to arrival', () => {
    expect(codes(normalDay({ arrival: '09:00', leave: '09:00' }))).toEqual(['leave_not_after_arrival']);
  });

  it('rejects an overnight shift, documenting the deliberate limitation', () => {
    expect(codes(normalDay({ arrival: '22:00', leave: '06:00' }))).toEqual(['leave_not_after_arrival']);
  });

  it('rejects breaks longer than the span', () => {
    expect(codes(normalDay({ arrival: '09:00', leave: '17:00', breakMinutes: 600 })))
      .toEqual(['break_exceeds_span']);
  });

  it('accepts a break exactly equal to the span', () => {
    expect(validateEntryInput(normalDay({ arrival: '09:00', leave: '17:00', breakMinutes: 480 }))).toEqual([]);
  });

  it('requires at least one block on a normal day', () => {
    expect(codes({ dayType: 'normal', blocks: [], note: null })).toEqual(['times_required_for_normal_day']);
  });

  it('rejects a block missing one of its times', () => {
    expect(codes(normalDay({ arrival: '' }))).toEqual(['invalid_time']);
    expect(codes(normalDay({ leave: '' }))).toEqual(['invalid_time']);
  });

  it('rejects a malformed time', () => {
    expect(codes(normalDay({ arrival: '8:00' }))).toEqual(['invalid_time']);
  });

  it('accepts special days with no blocks', () => {
    for (const dayType of ['vacation', 'sick', 'holiday'] as const) {
      expect(validateEntryInput(specialDay(dayType))).toEqual([]);
    }
  });

  it('rejects a special day that carries times', () => {
    expect(codes(specialDay('vacation', [{ arrival: '08:00', leave: '17:00', breakMinutes: 0 }])))
      .toEqual(['times_not_allowed_for_special_day']);
    expect(codes(specialDay('sick', [{ arrival: '08:00', leave: '17:00', breakMinutes: 30 }])))
      .toEqual(['times_not_allowed_for_special_day']);
  });

  it('accepts multiple non-overlapping blocks, in any input order', () => {
    expect(validateEntryInput({
      dayType: 'normal',
      blocks: [
        { arrival: '20:00', leave: '21:00', breakMinutes: 0 },
        { arrival: '08:00', leave: '12:00', breakMinutes: 0 },
      ],
      note: null,
    })).toEqual([]);
  });

  it('does not flag back-to-back adjacent blocks as overlapping', () => {
    expect(validateEntryInput({
      dayType: 'normal',
      blocks: [
        { arrival: '08:00', leave: '12:00', breakMinutes: 0 },
        { arrival: '12:00', leave: '16:00', breakMinutes: 0 },
      ],
      note: null,
    })).toEqual([]);
  });

  it('rejects overlapping blocks, which would otherwise double-count minutes', () => {
    expect(codes({
      dayType: 'normal',
      blocks: [
        { arrival: '08:00', leave: '17:00', breakMinutes: 0 },
        { arrival: '16:00', leave: '18:00', breakMinutes: 0 },
      ],
      note: null,
    })).toEqual(['blocks_overlap']);
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

describe('emailSchema', () => {
  it('accepts a well-formed address', () => {
    expect(emailSchema.safeParse('me@example.com').success).toBe(true);
  });

  it('trims and lowercases', () => {
    expect(emailSchema.parse('  Foo@Example.COM  ')).toBe('foo@example.com');
  });

  it.each(['nope', 'nope@', '@nope.com', 'nope@nope', ''])('rejects %j', (value) => {
    expect(emailSchema.safeParse(value).success).toBe(false);
  });
});

describe('passwordSchema', () => {
  it('accepts 8+ characters', () => {
    expect(passwordSchema.safeParse('12345678').success).toBe(true);
  });

  it('rejects fewer than 8 characters', () => {
    expect(passwordSchema.safeParse('1234567').success).toBe(false);
  });
});
