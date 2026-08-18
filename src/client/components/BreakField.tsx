export function BreakField({
  value, onChange, onBlur, invalid, disabled,
}: {
  value: number;
  onChange: (value: number) => void;
  onBlur?: () => void;
  invalid?: boolean;
  disabled?: boolean;
}) {
  return (
    <label className="field field-break">
      <span className="visually-hidden">Break in minutes</span>
      <input
        type="number"
        min={0}
        max={1440}
        step={5}
        inputMode="numeric"
        value={String(value)}
        aria-label="Break in minutes"
        aria-invalid={invalid || undefined}
        disabled={disabled}
        // An emptied field means zero break, never NaN.
        onChange={(e) => onChange(e.target.value === '' ? 0 : Number(e.target.value))}
        onBlur={onBlur}
      />
      <span className="field-suffix faint">min</span>
    </label>
  );
}
