import { describe, expect, it } from 'vitest';
import {
  cleanCampaign,
  cleanCampaignValue,
  extractCampaign,
  MAX_CAMPAIGN_VALUE_LENGTH
} from '../src/index.js';

describe('cleanCampaignValue', () => {
  it.each([
    ['Newsletter', 'newsletter'],
    ['  Spring   Sale  ', 'spring sale'],
    ['spring-sale_2026.v2', 'spring-sale_2026.v2'],
    ['a+b:c/d', 'a+b:c/d'],
    ['Café', 'café'],
    ['नमस्ते', 'नमस्ते'],
    ['campaña-été', 'campaña-été'],
    ['spring\u200bsale\u202e', 'springsale'],
    ['launch 🚀 day', 'launch day'],
    ['jane.doe@example.com', '[email]'],
    ['4111111111111111', '[number]'],
    ['call 555-123-4567 now', 'call [number] now'],
    ['aB3dE6gH9jK2mN5pQ8sT1vW4', '[token]'],
    ['abcdef12ab34cd56ef78', '[token]'],
    ['<script>alert(1)</script>', 'scriptalert1/script'],
    ['line\nbreak\tand\u0000nul', 'line break andnul'],
    ['"quoted"; DROP', 'quoted drop'],
    ['', ''],
    ['   ', ''],
    ['<>"\'', '']
  ])('cleans %j to %j', (input, expected) => {
    expect(cleanCampaignValue(input)).toBe(expected);
  });

  it('cuts to 64 characters', () => {
    expect(cleanCampaignValue('x'.repeat(500))).toHaveLength(MAX_CAMPAIGN_VALUE_LENGTH);
  });

  it('is idempotent', () => {
    for (const input of ['Jane@Example.com', 'A  B', '[email]', 'x'.repeat(100), 'a-b_c.d']) {
      const once = cleanCampaignValue(input);
      expect(cleanCampaignValue(once)).toBe(once);
    }
  });

  it('returns an empty string for anything that is not text, and never throws', () => {
    for (const input of [undefined, null, 5, {}, [], true, Symbol('x')])
      expect(cleanCampaignValue(input)).toBe('');
  });
});

describe('cleanCampaign', () => {
  it('keeps only the labels that have a value', () => {
    expect(cleanCampaign({ source: 'Twitter', medium: '', campaign: '<>' })).toEqual({
      source: 'twitter'
    });
  });

  it('returns undefined when nothing is left or the input is not an object', () => {
    expect(cleanCampaign({ source: '  ' })).toBeUndefined();
    expect(cleanCampaign(null)).toBeUndefined();
    expect(cleanCampaign('utm_source=x')).toBeUndefined();
  });

  it('ignores extra keys', () => {
    expect(cleanCampaign({ source: 'a', term: 'secret', content: 'x' })).toEqual({ source: 'a' });
  });
});

describe('extractCampaign', () => {
  it('reads the three parameters and nothing else', () => {
    expect(
      extractCampaign(
        '?utm_source=Newsletter&utm_medium=email&utm_campaign=spring-sale&utm_term=shoes&utm_content=b&token=abc&email=a@b.co'
      )
    ).toEqual({ source: 'newsletter', medium: 'email', campaign: 'spring-sale' });
  });

  it('matches names case-insensitively and takes the first occurrence', () => {
    expect(extractCampaign('?UTM_Source=A&utm_source=b&Utm_Medium=Social')).toEqual({
      source: 'a',
      medium: 'social'
    });
  });

  it('decodes plus and percent escapes', () => {
    expect(extractCampaign('?utm_campaign=big+sale%20now')).toEqual({ campaign: 'big sale now' });
  });

  it('works without the leading question mark', () => {
    expect(extractCampaign('utm_source=x')).toEqual({ source: 'x' });
  });

  it('returns undefined with no parameters, empty values, or malformed input', () => {
    expect(extractCampaign('')).toBeUndefined();
    expect(extractCampaign('?a=b')).toBeUndefined();
    expect(extractCampaign('?utm_source=&utm_medium=%20')).toBeUndefined();
    expect(extractCampaign('?utm_source=%E0%A4%A')).toBeDefined();
  });

  it('cleans hostile values', () => {
    expect(extractCampaign('?utm_source=jane@example.com&utm_medium=4111111111111111')).toEqual({
      source: '[email]',
      medium: '[number]'
    });
  });
});
