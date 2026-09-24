import type { DayType } from '@shared/types.ts';

export const DAY_TYPE_COLOR: Record<DayType, string> = {
  normal: 'var(--chart-normal)',
  vacation: 'var(--chart-vacation)',
  sick: 'var(--chart-sick)',
  holiday: 'var(--chart-holiday)',
};

/** Diagonal stripes of `color`, which tells "planned" apart from "taken" without a second hue. */
export const stripes = (color: string) =>
  `repeating-linear-gradient(135deg, ${color} 0 3px, color-mix(in srgb, ${color} 35%, transparent) 3px 6px)`;
