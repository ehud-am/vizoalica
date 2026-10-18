/**
 * The browser opt-out for a website's own team. Visiting any page of the website with
 * `?vizoalica_ignore=1` turns Vizoalica off in that browser; `?vizoalica_ignore=0` turns it back
 * on. The only thing stored is the constant `"1"` under one key, on the owner's own device and
 * only because a link with the switch was opened in that browser (the owner's own, normally). Nothing is sent while it is set, so these
 * visits cannot be counted (unlike address exclusions). See
 * specs/023-exclude-internal-traffic/contracts/exclusion-api.md.
 */
export const IGNORE_PARAM = 'vizoalica_ignore';
export const IGNORE_KEY = 'vizoalica.ignore';

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function requestedState(href: string): 'on' | 'off' | undefined {
  try {
    const value = new URL(href).searchParams.get(IGNORE_PARAM);
    if (value === '1' || value === 'true') return 'on';
    if (value === '0' || value === 'false') return 'off';
  } catch {
    // An unreadable address asks for nothing.
  }
  return undefined;
}

function defaultStorage(): StorageLike | null {
  try {
    // Reading the property itself can throw when site data is blocked.
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/**
 * Applies the URL switch, if present, and says whether this browser is opted out. Never throws:
 * blocked storage behaves as an unset flag, except that a page loaded with the switch on is
 * itself silent for that load.
 */
export function resolveIgnore(
  locationLike: Pick<Location, 'href'> = globalThis.location,
  storage: StorageLike | null = defaultStorage()
): boolean {
  const requested = locationLike ? requestedState(locationLike.href) : undefined;
  try {
    if (requested === 'on') {
      storage?.setItem(IGNORE_KEY, '1');
      return true;
    }
    if (requested === 'off') {
      storage?.removeItem(IGNORE_KEY);
      return false;
    }
    return storage?.getItem(IGNORE_KEY) === '1';
  } catch {
    return requested === 'on';
  }
}
