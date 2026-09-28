import { describe, expect, it } from 'vitest';
import { feedbackUrl } from '../src/feedback.js';

describe('feedbackUrl', () => {
  it('says unknown when the console does not know its version or screen', () => {
    const body = new URL(feedbackUrl()).searchParams.get('body') ?? '';
    expect(body).toContain('Console version: unknown');
    expect(body).toContain('Screen: unknown');
  });

  it('carries only the three questions, the version and the screen', () => {
    const url = new URL(feedbackUrl({ version: '1.2.3', page: 'manage/websites' }));
    expect([...url.searchParams.keys()]).toEqual(['category', 'title', 'body']);
    const body = url.searchParams.get('body') ?? '';
    expect(body.match(/\*\*[^*]+\*\*/g)).toEqual([
      '**What were you trying to do?**',
      '**What happened, or what was confusing?**',
      '**What would make it better?**'
    ]);
    expect(body.trimEnd().split('\n').slice(-2)).toEqual([
      'Console version: 1.2.3',
      'Screen: manage/websites'
    ]);
  });
});
