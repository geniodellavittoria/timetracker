export interface StackedSegment {
  key: string;
  label: string;
  value: number;
  /** CSS background — a colour or a pattern. */
  fill: string;
  /** Legend text for the value; defaults to the plain number. */
  valueText?: string;
}

/**
 * One horizontal bar split into segments, with a legend that carries every
 * value, so the numbers stay readable without the colours. A `total` larger
 * than the segment sum leaves the remainder as an empty track.
 */
export function StackedBar({
  segments,
  total,
  label,
  extraLegend,
  compact = false,
}: {
  segments: StackedSegment[];
  total?: number;
  label: string;
  /** Legend entries without a segment of their own, e.g. the empty remainder. */
  extraLegend?: React.ReactNode;
  /** Bar only, no legend — for the header. */
  compact?: boolean;
}) {
  const sum = segments.reduce((s, seg) => s + seg.value, 0);
  const max = Math.max(total ?? sum, sum, 1);
  const summaryText = segments.map((seg) => `${seg.label} ${seg.valueText ?? seg.value}`).join(', ');

  return (
    <div className={compact ? 'stacked-bar is-compact' : 'stacked-bar'}>
      <div className="stacked-track" role="img" aria-label={`${label}: ${summaryText}`}>
        {segments.filter((seg) => seg.value > 0).map((seg) => (
          <span
            key={seg.key}
            className="stacked-segment"
            style={{ width: `${(seg.value / max) * 100}%`, background: seg.fill }}
            title={`${seg.label}: ${seg.valueText ?? seg.value}`}
          />
        ))}
      </div>
      {!compact && (
        <ul className="chart-legend">
          {segments.map((seg) => (
            <li key={seg.key}>
              <span className="legend-swatch" style={{ background: seg.fill }} />
              {seg.label} <strong className="num">{seg.valueText ?? seg.value}</strong>
            </li>
          ))}
          {extraLegend}
        </ul>
      )}
    </div>
  );
}
