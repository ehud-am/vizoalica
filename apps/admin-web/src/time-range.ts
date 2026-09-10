export type RangePreset = '6h' | '12h' | '24h' | '7d' | '30d';

export const RANGE_PRESETS: Array<{ value: RangePreset; label: string }> = [
  { value: '6h', label: 'Last 6 hours' },
  { value: '12h', label: 'Last 12 hours' },
  { value: '24h', label: 'Last 24 hours' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' }
];

const PRESET_HOURS: Record<RangePreset, number> = {
  '6h': 6,
  '12h': 12,
  '24h': 24,
  '7d': 24 * 7,
  '30d': 24 * 30
};

export const MAX_RANGE_MS = 30 * 24 * 60 * 60 * 1000;

export type AppliedRange =
  | { kind: 'preset'; preset: RangePreset; startUtc: string; endUtc: string }
  | { kind: 'custom'; startUtc: string; endUtc: string };

export function presetToRange(preset: RangePreset, now = new Date()): AppliedRange {
  const end = roundToUtcMinute(now);
  const start = new Date(end.getTime() - PRESET_HOURS[preset] * 60 * 60 * 1000);
  return {
    kind: 'preset',
    preset,
    startUtc: start.toISOString(),
    endUtc: end.toISOString()
  };
}

function roundToUtcMinute(date: Date): Date {
  const value = new Date(date);
  value.setUTCSeconds(0, 0);
  return value;
}

/** Local browser timezone name, e.g. "America/New_York"; falls back to a fixed offset label. */
export function localTimeZoneLabel(): string {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (zone) return zone;
  } catch {
    // Intl can be unavailable in constrained environments; fall through to the offset label.
  }
  const offsetMinutes = -new Date().getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const abs = Math.abs(offsetMinutes);
  return `UTC${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
}

const DATETIME_LOCAL_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

/** Converts a UTC ISO instant into the value a <input type="datetime-local"> expects, in local wall-clock time. */
export function utcToDatetimeLocalValue(utcIso: string): string {
  const date = new Date(utcIso);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Parses a <input type="datetime-local"> value (local wall-clock time, no offset) into a minute-precise UTC ISO string. */
export function datetimeLocalValueToUtc(value: string): string | undefined {
  const match = DATETIME_LOCAL_PATTERN.exec(value);
  if (!match) return undefined;
  const [, year, month, day, hour, minute] = match.map(Number);
  const date = new Date(year!, month! - 1, day!, hour!, minute!, 0, 0);
  if (Number.isNaN(date.getTime())) return undefined;
  return roundToUtcMinute(date).toISOString();
}

export interface RangeFieldError {
  field: 'start' | 'end';
  message: string;
}

/** Client-side mirror of the server's range rules, for immediate feedback before Apply. */
export function validateCustomRange(
  startUtc: string | undefined,
  endUtc: string | undefined,
  now = new Date()
): RangeFieldError | undefined {
  if (!startUtc) return { field: 'start', message: 'Start is required.' };
  if (!endUtc) return { field: 'end', message: 'End is required.' };
  const start = new Date(startUtc);
  const end = new Date(endUtc);
  if (!Number.isFinite(start.getTime()))
    return { field: 'start', message: 'Start is not a valid date.' };
  if (!Number.isFinite(end.getTime())) return { field: 'end', message: 'End is not a valid date.' };
  if (start.getTime() >= end.getTime())
    return { field: 'end', message: 'End must be after start.' };
  const completeNow = roundToUtcMinute(now);
  if (end.getTime() > completeNow.getTime())
    return { field: 'end', message: 'End must not be later than the current complete minute.' };
  if (end.getTime() - start.getTime() > MAX_RANGE_MS)
    return { field: 'end', message: 'Range must not exceed 30 days.' };
  return undefined;
}

function formatLocal(iso: string): string {
  return new Date(iso).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}

export function rangeSummary(range: AppliedRange): string {
  if (range.kind === 'preset') return RANGE_PRESETS.find((p) => p.value === range.preset)!.label;
  return `${formatLocal(range.startUtc)} – ${formatLocal(range.endUtc)}`;
}

export const DEFAULT_RANGE_PRESET: RangePreset = '24h';
