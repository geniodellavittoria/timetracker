import { describe, expect, it } from 'vitest';
import { weekdayOf } from '@shared/dates.ts';
import { CANTONS, holidaysForCanton } from '@shared/holidays.ts';

describe('holidaysForCanton', () => {
  it('lists 26 cantons', () => {
    expect(CANTONS).toHaveLength(26);
  });

  it('every canton observes New Year, National Day and Christmas', () => {
    for (const { code } of CANTONS) {
      const dates = holidaysForCanton(code, 2026).map((h) => h.date);
      expect(dates).toContain('2026-01-01');
      expect(dates).toContain('2026-08-01');
      expect(dates).toContain('2026-12-25');
    }
  });

  it('resolves Easter-relative holidays against known Easter Sundays', () => {
    // Easter Sunday 2026-04-05, 2027-03-28, 2024-03-31.
    const zh2026 = holidaysForCanton('ZH', 2026);
    expect(zh2026.find((h) => h.name === 'Karfreitag')?.date).toBe('2026-04-03');
    expect(zh2026.find((h) => h.name === 'Ostermontag')?.date).toBe('2026-04-06');
    expect(zh2026.find((h) => h.name === 'Auffahrt')?.date).toBe('2026-05-14');
    expect(zh2026.find((h) => h.name === 'Pfingstmontag')?.date).toBe('2026-05-25');

    const zh2027 = holidaysForCanton('ZH', 2027);
    expect(zh2027.find((h) => h.name === 'Karfreitag')?.date).toBe('2027-03-26');

    const zh2024 = holidaysForCanton('ZH', 2024);
    expect(zh2024.find((h) => h.name === 'Karfreitag')?.date).toBe('2024-03-29');
  });

  it('excludes Ticino and Valais from Karfreitag/Ostermontag/Pfingstmontag', () => {
    for (const code of ['TI', 'VS'] as const) {
      const names = holidaysForCanton(code, 2026).map((h) => h.name);
      expect(names).not.toContain('Karfreitag');
      expect(names).not.toContain('Ostermontag');
      expect(names).not.toContain('Pfingstmontag');
    }
  });

  it('includes Geneva-only and Vaud-only holidays on the right weekday', () => {
    const geneva = holidaysForCanton('GE', 2026);
    const jeune = geneva.find((h) => h.name === 'Jeûne genevois');
    expect(jeune).toBeDefined();
    expect(weekdayOf(jeune!.date)).toBe(3); // Thursday, Mon=0

    const vaud = holidaysForCanton('VD', 2026);
    const lundi = vaud.find((h) => h.name === 'Lundi du Jeûne');
    expect(lundi).toBeDefined();
    expect(weekdayOf(lundi!.date)).toBe(0); // Monday

    expect(holidaysForCanton('ZH', 2026).map((h) => h.name)).not.toContain('Jeûne genevois');
  });

  it('does not give Zürich the Catholic-canton feast days', () => {
    const names = holidaysForCanton('ZH', 2026).map((h) => h.name);
    expect(names).not.toContain('Fronleichnam');
    expect(names).not.toContain('Mariä Himmelfahrt');
  });

  it('gives Glarus its Näfelser Fahrt on the first Thursday of April', () => {
    const naefels = holidaysForCanton('GL', 2026).find((h) => h.name === 'Näfelser Fahrt');
    expect(naefels).toBeDefined();
    expect(weekdayOf(naefels!.date)).toBe(3);
    expect(naefels!.date.slice(5, 7)).toBe('04');
  });

  it('returns a sorted, date-ascending list', () => {
    const dates = holidaysForCanton('LU', 2026).map((h) => h.date);
    const sorted = [...dates].sort();
    expect(dates).toEqual(sorted);
  });
});
