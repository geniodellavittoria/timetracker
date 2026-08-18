import { formatDuration } from '@shared/time.ts';

/** The number the whole app exists to produce, so it lives in the header. */
export function BalanceBadge({ minutes, loading }: { minutes: number | null; loading?: boolean }) {
  if (loading || minutes === null) {
    return <span className="badge badge-neutral">Balance …</span>;
  }
  const tone = minutes === 0 ? 'neutral' : minutes > 0 ? 'positive' : 'negative';
  return (
    <span className={`badge badge-${tone}`} title="Overtime balance across every day recorded so far">
      <span className="badge-label">Balance</span>
      <strong className="num">{formatDuration(minutes, { signed: true })}</strong>
    </span>
  );
}
