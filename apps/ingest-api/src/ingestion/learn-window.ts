/**
 * The learning window: the days during which the accessible structure of pages may be sent.
 * It is off unless the operator sets a start date (and optionally a length in days) on the
 * Worker. The Worker also bakes it into the script it serves, so the browser needs no extra call.
 */
export const DEFAULT_LEARN_DAYS = 14;
export const MAX_LEARN_DAYS = 90;
const DAY_MS = 86_400_000;

export type LearnWindow = { startUtc: string; endUtc: string; days: number };

/** Parses `YYYY-MM-DD` and a day count; undefined when unset or invalid (capture stays off). */
export function parseLearnWindow(start: unknown, days: unknown): LearnWindow | undefined {
  if (typeof start !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(start.trim())) return undefined;
  const from = Date.parse(`${start.trim()}T00:00:00.000Z`);
  if (!Number.isFinite(from)) return undefined;
  let length = DEFAULT_LEARN_DAYS;
  if (days !== undefined && days !== '') {
    length = Number(days);
    if (!Number.isInteger(length) || length < 1 || length > MAX_LEARN_DAYS) return undefined;
  }
  return {
    startUtc: new Date(from).toISOString(),
    endUtc: new Date(from + length * DAY_MS).toISOString(),
    days: length
  };
}

export function isLearnWindowOpen(window: LearnWindow | undefined, now: Date): boolean {
  if (!window) return false;
  const time = now.getTime();
  return time >= Date.parse(window.startUtc) && time < Date.parse(window.endUtc);
}
