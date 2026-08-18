export function PeriodNav({
  label, onPrev, onNext, onToday,
}: {
  label: string;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
}) {
  return (
    <div className="period-nav">
      <button type="button" className="ghost" onClick={onPrev} aria-label="Vorherige Periode">‹</button>
      <h2>{label}</h2>
      <button type="button" className="ghost" onClick={onNext} aria-label="Nächste Periode">›</button>
      <span className="spacer" />
      <button type="button" onClick={onToday}>Heute</button>
    </div>
  );
}
