import { afterEach } from 'vitest';

// The console remembers its last scope in localStorage and its route in the URL hash. Both would
// leak from one test into the next inside a shared jsdom window, so reset them after every test.
afterEach(() => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.clear();
  } catch {
    // Storage may be unavailable in some environments; nothing to reset then.
  }
  window.location.hash = '';
});
