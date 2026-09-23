import { useState } from 'react';

const STORAGE_KEY = 'vizoalica_connect_notice';

const MESSAGE: Record<string, string> = {
  administrator_secret_used:
    'That was an administrator secret, not an access key, so you are connected as admin.',
  role_corrected: "You're connected, but with a different role than you chose. Your key decides it."
};

/** A connect that used a different credential or role than chosen leaves a one-line note for the
 * next screen, since the console it lands on (after first run, or from the Connection screen) is a
 * different component tree than the form that made the connection. */
export function rememberConnectNotice(notice: string | undefined): void {
  if (!notice) return;
  try {
    sessionStorage.setItem(STORAGE_KEY, notice);
  } catch {
    // Best effort: worst case the note is simply not shown.
  }
}

/** Shown once, right after landing in the console, then cleared. */
export function ConnectionNotice() {
  const [notice] = useState(() => {
    try {
      const value = sessionStorage.getItem(STORAGE_KEY);
      sessionStorage.removeItem(STORAGE_KEY);
      return value ?? undefined;
    } catch {
      return undefined;
    }
  });
  if (!notice || !MESSAGE[notice]) return null;
  return (
    <p className="notice" role="status">
      {MESSAGE[notice]}
    </p>
  );
}
