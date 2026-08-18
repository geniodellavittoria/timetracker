import { DAY_TYPES } from '@shared/types.ts';
import type { DayType } from '@shared/types.ts';

const LABELS: Record<DayType, string> = {
  normal: 'Work',
  vacation: 'Vacation',
  sick: 'Sick',
  holiday: 'Holiday',
};

export function DayTypeSelect({
  value, onChange, disabled,
}: {
  value: DayType;
  onChange: (value: DayType) => void;
  disabled?: boolean;
}) {
  return (
    <select
      className="day-type"
      value={value}
      aria-label="Day type"
      disabled={disabled}
      onChange={(e) => onChange(e.target.value as DayType)}
    >
      {DAY_TYPES.map((type) => (
        <option key={type} value={type}>{LABELS[type]}</option>
      ))}
    </select>
  );
}

export const dayTypeLabel = (type: DayType) => LABELS[type];
