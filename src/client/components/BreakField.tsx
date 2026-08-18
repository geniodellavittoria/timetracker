export function BreakField({
  value, onChange, onBlur, invalid, disabled, label = 'Pause in Minuten',
}: {
  value: number;
  onChange: (value: number) => void;
  onBlur?: () => void;
  invalid?: boolean;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <label className="field field-break">
      <span className="visually-hidden">{label}</span>
      <input
        type="number"
        min={0}
        max={1440}
        step={5}
        inputMode="numeric"
        value={String(value)}
        aria-label={label}
        aria-invalid={invalid || undefined}
        disabled={disabled}
        // An emptied field means zero break, never NaN.
        onChange={(e) => onChange(e.target.value === '' ? 0 : Number(e.target.value))}
        onBlur={onBlur}
      />
      <span className="field-suffix faint">Min</span>
    </label>
  );
}
