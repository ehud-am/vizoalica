import { useMemo, useState } from 'react';
import { WORLD_OUTLINE, WORLD_SHAPES, WORLD_VIEWBOX } from '../../geo/world-paths.js';
import { codeForNumeric } from '../../geo/geo-labels.js';
import { formatNumber, formatShare } from '../../format.js';
import type { LocationData, LocationRow } from './locations.js';

const STEPS = 7;

/**
 * Class 1..7 on a square-root scale between the smallest and the largest value shown, so a few
 * large countries neither wash out the rest nor push every other country into the top class.
 */
export function stepFor(count: number, min: number, max: number): number {
  if (count <= 0 || max <= 0) return 0;
  if (max <= min) return STEPS;
  const position = (Math.sqrt(count) - Math.sqrt(min)) / (Math.sqrt(max) - Math.sqrt(min));
  return Math.min(STEPS, Math.max(1, 1 + Math.floor(position * (STEPS - 1) + 1e-9)));
}

const SHAPE_CODES = WORLD_SHAPES.map((shape) => ({
  path: shape.path,
  numeric: shape.numeric,
  code: codeForNumeric(shape.numeric)
}));

/**
 * World map shaded by page views. It draws bundled shapes only (no map service is contacted),
 * and everything it shows is also in the country table beside it, so it never carries
 * information that color alone would have to convey.
 */
export function WorldMap({ data }: { data: LocationData }) {
  const [active, setActive] = useState<LocationRow>();
  const byCode = useMemo(
    () => new Map(data.rows.filter((row) => row.code).map((row) => [row.code!, row])),
    [data.rows]
  );
  const counts = [...byCode.values()].map((row) => row.count);
  const max = Math.max(0, ...counts);
  const min = counts.length ? Math.min(...counts) : 0;
  return (
    <figure className="dashboard-card world-map">
      <figcaption>
        <h2>Page views by country</h2>
        <p>Stronger shading means more page views. The table below lists every value.</p>
      </figcaption>
      <svg viewBox={WORLD_VIEWBOX} role="group" aria-label="World map of page views by country">
        <path className="map-sphere" d={WORLD_OUTLINE} />
        {SHAPE_CODES.map((shape) => {
          const row = shape.code ? byCode.get(shape.code) : undefined;
          if (!row) return <path key={shape.numeric} className="map-country none" d={shape.path} />;
          return (
            <path
              key={shape.numeric}
              className={`map-country step-${stepFor(row.count, min, max)}`}
              d={shape.path}
              tabIndex={0}
              role="img"
              aria-label={`${row.name}: ${formatNumber(row.count)} page views, ${formatShare(row.count, data.total)}`}
              onMouseEnter={() => setActive(row)}
              onMouseLeave={() => setActive(undefined)}
              onFocus={() => setActive(row)}
              onBlur={() => setActive(undefined)}
            />
          );
        })}
      </svg>
      <p className="map-readout" aria-hidden="true">
        {active
          ? `${active.name}: ${formatNumber(active.count)} page views (${formatShare(active.count, data.total)})`
          : 'Hover or focus a shaded country for its value.'}
      </p>
      <div className="map-legend" aria-hidden="true">
        <span className="legend-none" /> No traffic
        <span className="legend-ramp">
          {Array.from({ length: STEPS }, (_, index) => (
            <span key={index} className={`step-${index + 1}`} />
          ))}
        </span>
        <span>
          {max <= 0
            ? 'No traffic'
            : min === max
              ? `${formatNumber(max)} page views`
              : `${formatNumber(min)} to ${formatNumber(max)} page views`}
        </span>
      </div>
    </figure>
  );
}
