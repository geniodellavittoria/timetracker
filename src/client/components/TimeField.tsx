export function TimeField({
  label, value, onChange, onBlur, invalid, disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  invalid?: boolean;
  disabled?: boolean;
}) {
  return (
    <label className="field">
      <span className="visually-hidden">{label}</span>
      <input
        type="time"
        // Without step=60 Chrome can emit HH:MM:SS, which the strict parser rejects.
        step={60}
        value={value}
        aria-label={label}
        aria-invalid={invalid || undefined}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
      />
    </label>
  );
}
