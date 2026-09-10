import { describe, expect, it } from 'vitest';
import { classifyRequest } from '../src/analytics/classifier.js';

const CHROME_WINDOWS =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const SAFARI_MAC =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15';
const FIREFOX_LINUX = 'Mozilla/5.0 (X11; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0';
const IPHONE_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1';
const ANDROID_CHROME =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';
const IPAD_SAFARI =
  'Mozilla/5.0 (iPad; CPU OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1';
const GOOGLEBOT =
  'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';

function request(ua: string | undefined, cf?: Record<string, unknown>): Request {
  const headers = new Headers();
  if (ua !== undefined) headers.set('user-agent', ua);
  const req = new Request('https://ingest.test/v1/events:batch', { headers });
  if (cf) Object.defineProperty(req, 'cf', { value: cf });
  return req;
}

describe('dashboard classifier', () => {
  it('normalizes country from cf, honoring the T1 special value and rejecting spoofable junk', () => {
    expect(classifyRequest(request(CHROME_WINDOWS, { country: 'us' })).country).toBe('US');
    expect(classifyRequest(request(CHROME_WINDOWS, { country: 'T1' })).country).toBe('T1');
    expect(classifyRequest(request(CHROME_WINDOWS, { country: 'XX' })).country).toBe('Unknown');
    expect(classifyRequest(request(CHROME_WINDOWS, { country: 123 })).country).toBe('Unknown');
    expect(classifyRequest(request(CHROME_WINDOWS)).country).toBe('Unknown');
  });

  it('identifies browser family and a bounded major version', () => {
    expect(classifyRequest(request(CHROME_WINDOWS))).toMatchObject({
      browser: 'Chrome',
      userAgentFamily: 'Chrome 120'
    });
    expect(classifyRequest(request(SAFARI_MAC))).toMatchObject({ browser: 'Safari' });
    expect(classifyRequest(request(FIREFOX_LINUX))).toMatchObject({
      browser: 'Firefox',
      userAgentFamily: 'Firefox 121'
    });
  });

  it('caps an out-of-range major version rather than propagating a garbage number', () => {
    const ua = 'Mozilla/5.0 Chrome/999999999.0.0.0 Safari/537.36';
    const result = classifyRequest(request(ua));
    expect(result.browser).toBe('Chrome');
    expect(result.userAgentFamily).toBe('Chrome');
  });

  it('resolves operating system with iOS/iPadOS taking precedence over generic Mac tokens', () => {
    expect(classifyRequest(request(IPHONE_SAFARI)).os).toBe('iOS');
    expect(classifyRequest(request(IPAD_SAFARI)).os).toBe('iOS');
    expect(classifyRequest(request(SAFARI_MAC)).os).toBe('macOS');
    expect(classifyRequest(request(ANDROID_CHROME)).os).toBe('Android');
    expect(classifyRequest(request(FIREFOX_LINUX)).os).toBe('Linux');
  });

  it('classifies device family from user-agent tokens', () => {
    expect(classifyRequest(request(IPHONE_SAFARI)).device).toBe('mobile');
    expect(classifyRequest(request(ANDROID_CHROME)).device).toBe('mobile');
    expect(classifyRequest(request(IPAD_SAFARI)).device).toBe('tablet');
    expect(classifyRequest(request(CHROME_WINDOWS)).device).toBe('desktop');
    expect(classifyRequest(request('')).device).toBe('unknown');
  });

  it('marks a clear bot user-agent as bot traffic regardless of bot-management score', () => {
    const result = classifyRequest(request(GOOGLEBOT, { botManagement: { score: 80 } }));
    expect(result.traffic).toBe('bot');
    expect(result.userAgentFamily).toBe('Googlebot');
  });

  it('marks an ordinary browser as human traffic when bot management agrees', () => {
    const result = classifyRequest(request(CHROME_WINDOWS, { botManagement: { score: 60 } }));
    expect(result.traffic).toBe('human');
  });

  it('resolves conflicting bot-management evidence toward bot when a low score or a verified/signed bot flag is present', () => {
    expect(
      classifyRequest(request(CHROME_WINDOWS, { botManagement: { score: 5 } })).traffic
    ).toBe('bot');
    expect(
      classifyRequest(request(CHROME_WINDOWS, { botManagement: { verifiedBot: true, score: 90 } }))
        .traffic
    ).toBe('bot');
    expect(
      classifyRequest(request(CHROME_WINDOWS, { botManagement: { signedAgent: true } })).traffic
    ).toBe('bot');
  });

  it('falls back to Unknown for a missing user-agent and Other for an unrecognized one', () => {
    expect(classifyRequest(request(undefined))).toMatchObject({
      browser: 'Unknown',
      os: 'Unknown',
      userAgentFamily: 'Unknown'
    });
    expect(classifyRequest(request('SomeUnrecognizedAgent/1.0'))).toMatchObject({
      browser: 'Other',
      os: 'Other'
    });
  });

  it('treats an oversized or control-character-bearing user-agent as absent rather than inspecting it', () => {
    const oversized = 'Chrome/120.0.0.0 ' + 'a'.repeat(600);
    expect(classifyRequest(request(oversized))).toMatchObject({
      browser: 'Unknown',
      os: 'Unknown',
      device: 'unknown'
    });
    const withControlChar = `Chrome/120.0.0.0 Safari/537.36 `;
    expect(classifyRequest(request(withControlChar))).toMatchObject({ browser: 'Unknown' });
  });

  it('always tags results with taxonomy version 1', () => {
    expect(classifyRequest(request(CHROME_WINDOWS)).taxonomyVersion).toBe(1);
    expect(classifyRequest(request(undefined)).taxonomyVersion).toBe(1);
  });
});
