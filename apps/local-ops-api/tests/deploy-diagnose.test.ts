import { describe, expect, it } from 'vitest';
import { diagnose, notSignedInIssue } from '../src/deploy/diagnose.js';

describe('diagnose', () => {
  it('names the blocked address for an IP-filtered token, ignoring terminal colors', () => {
    const issue = diagnose(
      '\u001b[31m✘ [ERROR]\u001b[0m Cannot use the access token from location: 203.0.113.9 [code: 9109]'
    );
    expect(issue?.code).toBe('ip_not_allowed');
    expect(issue?.detail).toContain('203.0.113.9');
    expect(issue?.steps.join(' ')).toContain('Client IP Address Filtering');
  });

  it('tells a token-mode admin to fix the saved token, and a OneCLI admin to fix the OneCLI secret', () => {
    const text = 'Invalid API Token [code: 9106]';
    expect(diagnose(text, { mode: 'token' })?.steps.join(' ')).toContain(
      'saved for this environment'
    );
    expect(diagnose(text, { mode: 'onecli' })?.steps.join(' ')).toContain('OneCLI dashboard');
    expect(diagnose(text)?.fix).toBe('credential');
  });

  it('names the permission the failed step needs', () => {
    const text = 'Authentication error [code: 10000]';
    expect(diagnose(text, { step: 'create-bucket' })?.detail).toContain('Workers R2 Storage');
    expect(diagnose(text, { step: 'create-tables' })?.detail).toContain('D1');
    expect(diagnose(text, { step: 'deploy-worker' })?.detail).toContain('Workers Scripts');
    expect(diagnose(text)?.detail).toContain('Workers R2 Storage');
  });

  it('tells a refused OneCLI gateway from a general network failure', () => {
    expect(diagnose('connect ECONNREFUSED 127.0.0.1:10255')?.code).toBe(
      'onecli_gateway_unreachable'
    );
    expect(diagnose('connect ECONNREFUSED 104.16.0.1:443')?.code).toBe('network_unreachable');
    expect(diagnose('TypeError: fetch failed')?.code).toBe('network_unreachable');
  });

  it('gives every recognized problem ordered steps that end with how to continue', () => {
    for (const text of [
      'Cannot use the access token from location: 1.2.3.4 [code: 9109]',
      'Invalid API Token',
      'Authentication error [code: 10000]',
      'Please enable R2 [code: 10042]',
      'spawn onecli ENOENT',
      'connect ECONNREFUSED 127.0.0.1:10255',
      'agent "x" not found',
      'npm error code E404',
      'fetch failed'
    ]) {
      const issue = diagnose(text);
      expect(issue, text).toBeDefined();
      expect(issue!.steps.length).toBeGreaterThanOrEqual(2);
      expect(issue!.steps.at(-1), text).toMatch(/Check again|Resume/);
    }
  });

  it('returns nothing for output it does not recognize, and for a healthy result', () => {
    expect(diagnose('something entirely new went wrong')).toBeUndefined();
    expect(diagnose('Applied 2 migrations')).toBeUndefined();
    expect(diagnose('')).toBeUndefined();
  });

  it('shows what Cloudflare answered when the credential was not recognized', () => {
    const issue = notSignedInIssue({ mode: 'token' }, 'some\nlast lines\nof output');
    expect(issue.detail).toContain('of output');
    expect(issue.fix).toBe('credential');
  });
});
