export function PeriodNav({
  label, onPrev, onNext, onToday, onJump,
}: {
  label: string;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  /** Lets the user jump straight to an arbitrary date instead of stepping one period at a time. */
  onJump?: (date: string) => void;
}) {
  return (
    <div className="period-nav">
      <button type="button" className="ghost" onClick={onPrev} aria-label="Vorherige Periode">‹</button>
      <h2>{label}</h2>
      <button type="button" className="ghost" onClick={onNext} aria-label="Nächste Periode">›</button>
      <span className="spacer" />
      {onJump && (
        <label className="period-jump">
          <span className="visually-hidden">Zu Datum springen</span>
          <input
            type="date"
            aria-label="Zu Datum springen"
            // Uncontrolled: a one-shot "go here" action, not a value that
            // should keep tracking the period shown after navigating away.
            onChange={(e) => { if (e.target.value) onJump(e.target.value); }}
          />
        </label>
      )}
      <button type="button" onClick={onToday}>Heute</button>
    </div>
  );
}
