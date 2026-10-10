import { describe, expect, it } from 'vitest';
import { COUNTRIES } from '../src/geo/countries.js';
import {
  CONTINENTS,
  codeForNumeric,
  continentOf,
  describeLocation,
  locationName
} from '../src/geo/geo-labels.js';
import { WORLD_SHAPES } from '../src/geo/world-paths.js';

describe('location names', () => {
  it('shows full country names for stored codes, ignoring case and spacing', () => {
    expect(locationName('DE')).toBe('Germany');
    expect(locationName('us')).toBe('United States');
    expect(locationName(' KR ')).toBe('South Korea');
    expect(describeLocation('DE')).toMatchObject({
      kind: 'country',
      code: 'DE',
      continent: 'Europe'
    });
  });

  it('labels Tor and unknown-location values instead of showing raw codes', () => {
    expect(describeLocation('T1')).toEqual({ kind: 'tor', name: 'Tor network' });
    for (const value of ['XX', 'Unknown', 'unknown', '', '  '])
      expect(describeLocation(value)).toEqual({ kind: 'unknown', name: 'Unknown location' });
  });

  it('renders an unrecognized value safely as plain text', () => {
    const label = describeLocation('<img src=x onerror=alert(1)>');
    expect(label.kind).toBe('unrecognized');
    expect(label.name).toBe('<img src=x onerror=alert(1)> (unrecognized)');
    expect(label.continent).toBeUndefined();
    expect(locationName('ZZ')).toBe('ZZ (unrecognized)');
  });

  it('gives every country a name and a known continent, and no duplicate codes', () => {
    expect(new Set(COUNTRIES.map((country) => country.code)).size).toBe(COUNTRIES.length);
    for (const country of COUNTRIES) {
      expect(country.name.length).toBeGreaterThan(1);
      expect(CONTINENTS).toContain(country.continent);
      expect(locationName(country.code)).toBe(country.name);
    }
  });

  it('splits the Americas into North and South America', () => {
    expect(continentOf('US')).toBe('North America');
    expect(continentOf('MX')).toBe('North America');
    expect(continentOf('BR')).toBe('South America');
    expect(continentOf('JP')).toBe('Asia');
    expect(continentOf('AU')).toBe('Oceania');
    expect(continentOf('T1')).toBeUndefined();
  });

  it('joins map shapes to countries by numeric code', () => {
    expect(codeForNumeric('276')).toBe('DE');
    expect(codeForNumeric('000')).toBeUndefined();
    const joined = WORLD_SHAPES.filter((shape) => codeForNumeric(shape.numeric));
    expect(joined.length).toBeGreaterThan(160);
  });
});
