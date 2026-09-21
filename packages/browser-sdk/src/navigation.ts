/**
 * Reports in-page navigation: `history.pushState`, back and forward (`popstate`), and fragment
 * changes (`hashchange`). It calls `onNavigate` only when the page key actually changes, so a
 * navigation that fires both `popstate` and `hashchange` counts once, and so does the initial load.
 *
 * `replaceState` is observed too, because a router redirect (for example to a dashboard after
 * sign-in) is a real arrival on a new page. Routers also use it to tidy the query string, but the
 * page key ignores queries, so that never changes the key and never counts. The wrappers call the
 * original first and never let their own work throw into the page's router.
 */
export function watchNavigation(onNavigate: () => void, currentKey: () => string): () => void {
  const scope = globalThis as Partial<Window & typeof globalThis>;
  const history = scope.history;
  if (typeof scope.addEventListener !== 'function' || !history) return () => {};

  let last = currentKey();
  const check = () => {
    // Deferred so the router has finished updating `location` and is never delayed by us.
    queueMicrotask(() => {
      try {
        const key = currentKey();
        if (key === last) return;
        last = key;
        onNavigate();
      } catch {
        // Analytics must never affect the host page.
      }
    });
  };

  const wrap = (original: History['pushState']) =>
    function (this: History, ...args: Parameters<History['pushState']>) {
      const result = original.apply(this, args);
      check();
      return result;
    };
  const originalPush = history.pushState;
  const originalReplace = history.replaceState;
  const wrappedPush = wrap(originalPush);
  const wrappedReplace = wrap(originalReplace);
  try {
    history.pushState = wrappedPush;
    history.replaceState = wrappedReplace;
  } catch (error) {
    // All or nothing: never leave one wrapper installed that nothing can remove.
    if (history.pushState === wrappedPush) history.pushState = originalPush;
    throw error;
  }
  scope.addEventListener('popstate', check);
  scope.addEventListener('hashchange', check);

  return () => {
    if (history.pushState === wrappedPush) history.pushState = originalPush;
    if (history.replaceState === wrappedReplace) history.replaceState = originalReplace;
    scope.removeEventListener?.('popstate', check);
    scope.removeEventListener?.('hashchange', check);
  };
}
