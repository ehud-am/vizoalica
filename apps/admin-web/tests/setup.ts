import { afterEach, beforeEach, vi } from 'vitest';

/** One usable environment, so a rendered App opens the console rather than the welcome page. */
export const DEFAULT_ENVIRONMENTS = {
  file: { status: 'ok', path: '/home/test/.config/vizoalica/environments.json' },
  environments: [{ name: 'dev', role: 'admin', cloudflare: 'none', usable: true, problems: [] }],
  selected: 'dev'
};

// Unless a test says otherwise, the environments answer as above and everything else is unreachable,
// which is how a console that cannot ask how far along it is has always been tested.
beforeEach(() => {
  if (typeof window === 'undefined') return;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === '/api/environments') return Response.json(DEFAULT_ENVIRONMENTS);
      throw new TypeError('offline');
    })
  );
});

// The console remembers its last scope in localStorage and its route in the URL hash. Both would
// leak from one test into the next inside a shared jsdom window, so reset them after every test.
afterEach(() => {
  if (typeof window === 'undefined') return;
  vi.unstubAllGlobals();
  try {
    window.localStorage.clear();
  } catch {
    // Storage may be unavailable in some environments; nothing to reset then.
  }
  window.location.hash = '';
});
