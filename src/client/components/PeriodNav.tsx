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
      <button type="button" className="ghost" onClick={onPrev} aria-label="Previous period">‹</button>
      <h2>{label}</h2>
      <button type="button" className="ghost" onClick={onNext} aria-label="Next period">›</button>
      <span className="spacer" />
      <button type="button" onClick={onToday}>Today</button>
    </div>
  );
}
