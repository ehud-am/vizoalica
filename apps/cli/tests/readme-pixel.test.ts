import { describe, expect, it } from 'vitest';
// @ts-expect-error plain script module
import {
  applyReadmePixel,
  pixelMarkdown,
  settingsFromEnv
} from '../../../scripts/lib/readme-pixel.mjs';

const block = 'a\n<!-- readme-pixel:start -->\n<!-- readme-pixel:end -->\nb\n';
const settings = {
  endpoint: 'https://w.example.workers.dev/v1/events:batch',
  websiteKey: 'k1',
  path: '/npm/vizoalica'
};

describe('README pixel block', () => {
  it('builds the image from the endpoint, website key and path', () => {
    expect(pixelMarkdown(settings)).toBe(
      '![](https://w.example.workers.dev/v1/pixel.gif?website=k1&path=%2Fnpm%2Fvizoalica)'
    );
  });

  it('is empty when a setting is missing or the endpoint is not https', () => {
    expect(pixelMarkdown({ ...settings, endpoint: '' })).toBe('');
    expect(pixelMarkdown({ ...settings, websiteKey: undefined })).toBe('');
    expect(pixelMarkdown({ ...settings, endpoint: 'http://x.test' })).toBe('');
    expect(pixelMarkdown({ ...settings, endpoint: 'not a url' })).toBe('');
  });

  it('fills the block, replaces an earlier fill, and empties it again', () => {
    const filled = applyReadmePixel(block, settings);
    expect(filled).toContain('<!-- readme-pixel:start -->\n![](https://w.example.workers.dev');
    expect(filled.startsWith('a\n') && filled.endsWith('<!-- readme-pixel:end -->\nb\n')).toBe(
      true
    );
    expect(applyReadmePixel(filled, { ...settings, websiteKey: 'k2' })).toContain('website=k2');
    expect(applyReadmePixel(filled, { ...settings, websiteKey: '' })).toBe(block);
  });

  it('leaves text without markers alone', () => {
    expect(applyReadmePixel('plain', settings)).toBe('plain');
  });

  it('reads the dedicated website key before the shared one', () => {
    const env = {
      VIZOALICA_INGEST_ENDPOINT: 'e',
      VIZOALICA_WEBSITE_KEY: 'a',
      VIZOALICA_README_WEBSITE_KEY: 'b'
    };
    expect(settingsFromEnv(env, '/x').websiteKey).toBe('b');
    expect(settingsFromEnv({ VIZOALICA_WEBSITE_KEY: 'a' }, '/x').websiteKey).toBe('a');
  });
});
