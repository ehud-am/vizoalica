import { beforeEach, describe, expect, it, vi } from 'vitest';
import { currentPage, currentReferrer } from '../src/privacy.js';

beforeEach(() => {
  vi.stubGlobal('location', {
    href: 'https://example.com/form?token=secret',
    origin: 'https://example.com'
  });
  vi.stubGlobal('document', {
    title: 'Form',
    referrer: 'https://ref.example/path?email=a@example.com'
  });
});

describe('browser privacy helpers', () => {
  it('does not expose query values from the current URL', () => {
    expect(currentPage()).toEqual({
      url_origin: 'https://example.com',
      url_path: '/form',
      url_query_redacted: true
    });
  });

  it('minimizes referrer to origin only', () => {
    expect(currentReferrer()).toEqual({ origin: 'https://ref.example' });
  });
  it('does not read form field values when minimizing page context', () => {
    vi.stubGlobal('document', {
      title: 'Checkout',
      referrer: '',
      querySelectorAll: vi.fn(() => [
        { value: 'secret@example.com' },
        { value: '4111111111111111' }
      ])
    });
    expect(currentPage()).toEqual({
      url_origin: 'https://example.com',
      url_path: '/form',
      url_query_redacted: true
    });
    expect(document.querySelectorAll as unknown as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();
  });
});
