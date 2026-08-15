import { isForbiddenPropertyName, privacyLimits, sensitiveUrlKeys } from './policy.js';

export interface RedactedUrl {
  url_origin: string;
  url_path: string;
  url_query_redacted: boolean;
}

export function redactUrl(input: string | URL): RedactedUrl {
  const url = input instanceof URL ? input : new URL(input);
  return {
    url_origin: url.origin,
    url_path: url.pathname.slice(0, privacyLimits.maxUrlPathLength),
    url_query_redacted: url.search.length > 0
  };
}

export function redactReferrer(input: string | undefined): { origin?: string } | undefined {
  if (!input) return undefined;
  try {
    return { origin: new URL(input).origin };
  } catch {
    return undefined;
  }
}

export type SafePropertyValue = string | number | boolean | null;

export function sanitizeProperties(
  properties: Record<string, unknown> = {}
): Record<string, SafePropertyValue> {
  const safe: Record<string, SafePropertyValue> = {};
  for (const [rawName, rawValue] of Object.entries(properties).slice(
    0,
    privacyLimits.maxProperties
  )) {
    const name = rawName.trim().slice(0, privacyLimits.maxPropertyNameLength);
    if (!name || isForbiddenPropertyName(name) || sensitiveUrlKeys.has(name.toLowerCase()))
      continue;
    if (typeof rawValue === 'string')
      safe[name] = rawValue.slice(0, privacyLimits.maxPropertyValueLength);
    else if (typeof rawValue === 'number' && Number.isFinite(rawValue)) safe[name] = rawValue;
    else if (typeof rawValue === 'boolean' || rawValue === null) safe[name] = rawValue;
  }
  return safe;
}
