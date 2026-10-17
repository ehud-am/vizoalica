import { redactLabel } from './labels.js';

/**
 * Campaign labels: the three UTM parameters a site owner puts in links they share. They are labels
 * the owner chose, not visitor data, but anyone can craft a link, so every value is cleaned before
 * it leaves the browser and again at ingestion. See
 * specs/022-utm-campaign-report/data-model.md.
 */
export interface CampaignLabels {
  source?: string;
  medium?: string;
  campaign?: string;
}

export const MAX_CAMPAIGN_VALUE_LENGTH = 64;

const QUERY_NAMES = {
  utm_source: 'source',
  utm_medium: 'medium',
  utm_campaign: 'campaign'
} as const satisfies Record<string, keyof CampaignLabels>;

// Letters, digits, space and a few separators. The brackets keep the redaction placeholders
// (`[email]`, `[number]`, `[token]`) intact; everything else, markup and control characters
// included, is dropped.
const DISALLOWED = /[^\p{L}\p{N} _.+:/[\]-]/gu;

/**
 * A campaign value as reports store it, or '' when nothing is left. Redaction runs before
 * lowercasing because the token rule looks at letter case. Idempotent, and never throws.
 */
export function cleanCampaignValue(input: unknown): string {
  try {
    if (typeof input !== 'string') return '';
    return redactLabel(input)
      .toLowerCase()
      .replace(DISALLOWED, '')
      .replace(/ {2,}/g, ' ')
      .slice(0, MAX_CAMPAIGN_VALUE_LENGTH)
      .trim();
  } catch {
    return '';
  }
}

/** Cleans an object of the three labels, keeping only the ones with a value. */
export function cleanCampaign(input: unknown): CampaignLabels | undefined {
  if (typeof input !== 'object' || input === null) return undefined;
  const record = input as Record<string, unknown>;
  const labels: CampaignLabels = {};
  for (const key of ['source', 'medium', 'campaign'] as const) {
    const value = cleanCampaignValue(record[key]);
    if (value) labels[key] = value;
  }
  return Object.keys(labels).length ? labels : undefined;
}

/**
 * Reads the UTM parameters from a URL query string (names are case-insensitive, the first
 * occurrence wins) and returns cleaned labels. Nothing else in the query is read.
 */
export function extractCampaign(search: string): CampaignLabels | undefined {
  try {
    const found: Record<string, string> = {};
    for (const [name, value] of new URLSearchParams(search)) {
      const key = QUERY_NAMES[name.toLowerCase() as keyof typeof QUERY_NAMES];
      if (key && !(key in found)) found[key] = value;
    }
    return cleanCampaign(found);
  } catch {
    return undefined;
  }
}
