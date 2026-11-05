import { normalizePagePath } from '@vizoalica/privacy';

/**
 * Whether `target` is a page key the pipeline can store, exactly as written. Stored keys have no
 * trailing or doubled slash, no raw whitespace (a browser sends it encoded), and ids already
 * replaced (`/orders/:id`, never `/orders/123`), so any other spelling could never match a view.
 */
export function isStorablePageKey(target: string): boolean {
  return target.startsWith('/') && !/\s/.test(target) && normalizePagePath(target) === target;
}
