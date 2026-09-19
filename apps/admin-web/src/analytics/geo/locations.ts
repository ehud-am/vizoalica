import type { RankedResult } from '../../api/local-operations.js';
import { CONTINENTS, describeLocation, type LocationKind } from '../../geo/geo-labels.js';
import type { Continent } from '../../geo/countries.js';

export interface LocationRow {
  /** Stable key: the country code for countries, otherwise the kind. */
  key: string;
  kind: LocationKind;
  name: string;
  code?: string;
  continent?: Continent;
  count: number;
}

export interface LocationData {
  rows: LocationRow[];
  /** Traffic the Worker did not itemize (an older Worker only itemizes the top ten). */
  otherCount: number;
  total: number;
}

/** Turns stored country labels into display rows, merging labels that mean the same place. */
export function toLocationData(result: RankedResult): LocationData {
  const merged = new Map<string, LocationRow>();
  for (const item of result.items) {
    const location = describeLocation(item.label);
    const key =
      location.kind === 'country'
        ? location.code!
        : location.kind === 'unrecognized'
          ? item.label
          : location.kind;
    const existing = merged.get(key);
    if (existing) existing.count += item.count;
    else
      merged.set(key, {
        key,
        kind: location.kind,
        name: location.name,
        ...(location.code ? { code: location.code } : {}),
        ...(location.continent ? { continent: location.continent } : {}),
        count: item.count
      });
  }
  return {
    rows: [...merged.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
    otherCount: result.otherCount,
    total: result.total
  };
}

export interface ContinentTotal {
  name: Continent | 'Unlocated' | 'Not itemized';
  count: number;
  countryCount: number;
}

/** Continent totals; everything without a continent is kept apart so the rows sum to the total. */
export function continentTotals(data: LocationData): ContinentTotal[] {
  const totals = new Map<ContinentTotal['name'], ContinentTotal>();
  const add = (name: ContinentTotal['name'], count: number, country: boolean) => {
    const entry = totals.get(name) ?? { name, count: 0, countryCount: 0 };
    entry.count += count;
    if (country) entry.countryCount += 1;
    totals.set(name, entry);
  };
  for (const row of data.rows) add(row.continent ?? 'Unlocated', row.count, row.kind === 'country');
  if (data.otherCount > 0) add('Not itemized', data.otherCount, false);
  const order: ContinentTotal['name'][] = [...CONTINENTS, 'Unlocated', 'Not itemized'];
  return order
    .map((name) => totals.get(name))
    .filter((entry): entry is ContinentTotal => entry !== undefined)
    .sort((a, b) => b.count - a.count || order.indexOf(a.name) - order.indexOf(b.name));
}
