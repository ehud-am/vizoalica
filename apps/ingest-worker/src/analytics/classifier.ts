import type { RequestAnalyticsContext } from '../../../ingest-api/src/domain/types.js';

type CloudflareRequest = Request & {
  cf?: {
    country?: unknown;
    botManagement?: {
      score?: unknown;
      verifiedBot?: unknown;
      signedAgent?: unknown;
    } | null;
  };
};

type Browser = { name: string; major?: number };

function boundedMajor(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const major = Number(value);
  return Number.isInteger(major) && major >= 0 && major <= 999 ? major : undefined;
}

function browserFor(ua: string): Browser {
  const patterns: Array<[string, RegExp]> = [
    ['Edge', /(?:Edg|EdgiOS|EdgA)\/(\d{1,4})/i],
    ['Opera', /(?:OPR|Opera)\/(\d{1,4})/i],
    ['Samsung Internet', /SamsungBrowser\/(\d{1,4})/i],
    ['Firefox', /(?:Firefox|FxiOS)\/(\d{1,4})/i],
    ['Chrome', /(?:Chrome|CriOS)\/(\d{1,4})/i],
    ['Internet Explorer', /(?:MSIE\s|rv:)(\d{1,4})/i],
    ['Safari', /Version\/(\d{1,4}).*Safari\//i]
  ];
  for (const [name, pattern] of patterns) {
    const match = pattern.exec(ua);
    if (match) {
      const major = boundedMajor(match[1]);
      return { name, ...(major !== undefined ? { major } : {}) };
    }
  }
  return ua ? { name: 'Other' } : { name: 'Unknown' };
}

function osFor(ua: string): string {
  if (/iPhone|iPad|iPod/i.test(ua)) return 'iOS';
  if (/Android/i.test(ua)) return 'Android';
  if (/Windows/i.test(ua)) return 'Windows';
  if (/CrOS/i.test(ua)) return 'Chrome OS';
  if (/Macintosh|Mac OS X/i.test(ua)) return 'macOS';
  if (/Linux/i.test(ua)) return 'Linux';
  return ua ? 'Other' : 'Unknown';
}

function botFamily(ua: string): string | undefined {
  if (/Googlebot/i.test(ua)) return 'Googlebot';
  if (/bingbot/i.test(ua)) return 'Bingbot';
  if (/\b(?:bot|crawler|spider|slurp|headless|lighthouse)\b/i.test(ua)) return 'Other bot';
  if (/\b(?:curl|wget|python-requests|httpclient|okhttp)\b/i.test(ua)) return 'HTTP client';
  return undefined;
}

function countryFor(value: unknown): string {
  if (value === 'T1') return 'T1';
  if (typeof value === 'string' && /^[A-Za-z]{2}$/.test(value) && value.toUpperCase() !== 'XX')
    return value.toUpperCase();
  return 'Unknown';
}

export function classifyRequest(request: Request): RequestAnalyticsContext {
  const cf = (request as CloudflareRequest).cf;
  const raw = request.headers.get('user-agent') ?? '';
  const ua = raw.length <= 512 && !/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(raw) ? raw : '';
  const browser = browserFor(ua);
  const bot = botFamily(ua);
  const management = cf?.botManagement;
  const score = typeof management?.score === 'number' ? management.score : undefined;
  const strongBot = management?.verifiedBot === true || management?.signedAgent === true || !!bot;
  const traffic =
    strongBot || (score !== undefined && score >= 1 && score <= 29)
      ? 'bot'
      : score !== undefined && score >= 30 && score <= 99
        ? 'human'
        : browser.name !== 'Unknown' && browser.name !== 'Other'
          ? 'human'
          : 'unknown';
  const family = bot ?? browser.name;
  return {
    country: countryFor(cf?.country),
    browser: browser.name,
    os: osFor(ua),
    device: /iPad|Tablet/i.test(ua)
      ? 'tablet'
      : /Mobile|iPhone|Android/i.test(ua)
        ? 'mobile'
        : ua
          ? 'desktop'
          : 'unknown',
    traffic,
    userAgentFamily: browser.major !== undefined && !bot ? `${family} ${browser.major}` : family,
    taxonomyVersion: 1
  };
}

export const analyticsTaxonomy = {
  version: 1,
  browsers: [
    'Chrome',
    'Edge',
    'Firefox',
    'Safari',
    'Samsung Internet',
    'Opera',
    'Internet Explorer',
    'Other',
    'Unknown'
  ],
  operatingSystems: [
    'Windows',
    'macOS',
    'iOS',
    'Android',
    'Chrome OS',
    'Linux',
    'Other',
    'Unknown'
  ],
  devices: ['desktop', 'mobile', 'tablet', 'other', 'unknown'],
  traffic: ['bot', 'human', 'unknown']
} as const;
