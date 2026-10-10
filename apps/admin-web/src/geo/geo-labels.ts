import { COUNTRIES, type Continent } from './countries.js';

/** Continents in the order they are shown; also the keys of a continent summary. */
export const CONTINENTS: readonly Continent[] = [
  'Africa',
  'Antarctica',
  'Asia',
  'Europe',
  'North America',
  'Oceania',
  'South America'
];

const BY_CODE = new Map(COUNTRIES.map((country) => [country.code, country]));

// The Worker stores 'T1' for Tor traffic and 'Unknown' when Cloudflare gave no usable country;
// 'XX' is Cloudflare's own "unknown" marker and is treated the same way.
const TOR = 'T1';
const UNLOCATED = new Set(['XX', 'UNKNOWN', '']);

export type LocationKind = 'country' | 'tor' | 'unknown' | 'unrecognized';

export interface LocationLabel {
  kind: LocationKind;
  /** Full display name. Always plain text: never interpret it as markup. */
  name: string;
  /** Uppercase two-letter code, present only for recognized countries. */
  code?: string;
  continent?: Continent;
}

export function describeLocation(stored: string): LocationLabel {
  const value = stored.trim().toUpperCase();
  if (value === TOR) return { kind: 'tor', name: 'Tor network' };
  if (UNLOCATED.has(value)) return { kind: 'unknown', name: 'Unknown location' };
  const country = BY_CODE.get(value);
  if (country)
    return {
      kind: 'country',
      name: country.name,
      code: country.code,
      continent: country.continent
    };
  return { kind: 'unrecognized', name: `${stored.trim()} (unrecognized)` };
}

export const locationName = (stored: string): string => describeLocation(stored).name;
export const continentOf = (stored: string): Continent | undefined =>
  describeLocation(stored).continent;

/** Map shapes are keyed by ISO numeric code; this joins them back to the stored alpha-2 code. */
export function codeForNumeric(numeric: string): string | undefined {
  return COUNTRIES.find((country) => country.numeric === numeric)?.code;
}
