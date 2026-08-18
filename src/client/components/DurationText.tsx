import { formatDuration } from '@shared/time.ts';

/**
 * The only place a duration is rendered, so every total in the app is formatted
 * identically by construction.
 */
export function DurationText({
  minutes,
  signed = false,
  colored = false,
  placeholder = '—',
}: {
  minutes: number | null;
  signed?: boolean;
  colored?: boolean;
  placeholder?: string;
}) {
  if (minutes === null) return <span className="faint num">{placeholder}</span>;

  const color = !colored || minutes === 0
    ? undefined
    : minutes > 0 ? 'var(--positive)' : 'var(--negative)';

  return (
    <span className="num" style={color ? { color, fontWeight: 600 } : undefined}>
      {formatDuration(minutes, { signed })}
    </span>
  );
}
