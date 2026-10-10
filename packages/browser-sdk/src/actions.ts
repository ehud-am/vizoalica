import type { ActionKind } from '@vizoalica/event-contracts';
import { normalizePagePath, redactLabel } from '@vizoalica/privacy';

/**
 * Records deliberate activations of buttons, links, and button-like controls (a mouse click, or
 * Enter or Space, which the browser reports as a click). It never reads typed text or field values:
 * text inputs, textareas, selects, and editable regions are not eligible, and the only text used is
 * the control's own label, redacted. See
 * specs/017-page-breakdown-and-actions/contracts/sdk-action-collection.md.
 */
export interface ActionObservation {
  name: string;
  kind: ActionKind;
  /** The page key the action happened on. */
  page: string;
  destination?: { url_origin: string; url_path: string };
}

const ELIGIBLE = [
  'button',
  'a[href]',
  'input[type="button"]',
  'input[type="submit"]',
  'input[type="reset"]',
  'input[type="image"]',
  '[role="button"]',
  '[role="link"]',
  '[role="menuitem"]',
  '[role="tab"]'
].join(',');
const TYPING_FIELD =
  'input:not([type="button"]):not([type="submit"]):not([type="reset"]):not([type="image"]),textarea,select,[contenteditable]:not([contenteditable="false"])';

// Double-clicks and held keys should count once; an endless-click script must not flood quotas.
const DUPLICATE_WINDOW_MS = 500;
// A click belongs to the page where the interaction began, not the page a router moved to while
// handling it. The gap between pressing and clicking is normally well under a second.
const INTERACTION_WINDOW_MS = 5000;
const MAX_ACTIONS_PER_MINUTE = 100;
const FALLBACK_NAME: Record<ActionKind, string> = {
  button: 'Unlabeled button',
  link: 'Unlabeled link',
  other: 'Unlabeled control'
};

function kindOf(element: Element): ActionKind {
  const role = element.getAttribute('role');
  if (role === 'link') return 'link';
  if (role === 'button') return 'button';
  if (role === 'menuitem' || role === 'tab') return 'other';
  const tag = element.tagName.toLowerCase();
  return tag === 'a' ? 'link' : 'button';
}

function nameOf(element: Element, kind: ActionKind): string {
  const isInput = element.tagName.toLowerCase() === 'input';
  const candidates = [
    element.getAttribute('data-vizoalica-action'),
    element.getAttribute('aria-label'),
    isInput ? element.getAttribute('value') : element.textContent,
    element.getAttribute('title'),
    element.querySelector('img[alt]')?.getAttribute('alt')
  ];
  for (const candidate of candidates) {
    const name = redactLabel(candidate);
    if (name) return name;
  }
  return FALLBACK_NAME[kind];
}

function destinationOf(element: Element): ActionObservation['destination'] {
  const href = element.getAttribute('href');
  if (!href) return undefined;
  try {
    const url = new URL(href, globalThis.location?.href);
    // mailto:, tel:, and javascript: carry an address, a number, or code: nothing is recorded.
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined;
    return {
      url_origin: url.origin,
      url_path: normalizePagePath({ pathname: url.pathname, hash: url.hash })
    };
  } catch {
    return undefined;
  }
}

function elementOf(target: EventTarget | null): Element | null {
  const node = target as Node | null;
  if (!node) return null;
  const candidate = (node.nodeType === 1 ? node : node.parentElement) as Element | null;
  return candidate && typeof candidate.closest === 'function' ? candidate : null;
}

export interface ActionWatchOptions {
  /** The current page key, read at click time. */
  currentPage: () => string;
  now?: () => number;
}

export function watchActions(
  onAction: (action: ActionObservation) => void,
  options: ActionWatchOptions
): () => void {
  const doc = globalThis.document as Document | undefined;
  if (!doc || typeof doc.addEventListener !== 'function') return () => {};
  const now = options.now ?? (() => Date.now());
  const recent = new Map<string, number>();
  const stamps: number[] = [];
  let interaction: { page: string; at: number } | undefined;

  // Single-page routers commonly handle a link click in a capture listener on `window`, which runs
  // before ours and has already changed the address by the time we see the click. The press
  // (pointer down, or the key that activates a control) always comes first, so the page is read there.
  const begin = () => {
    try {
      interaction = { page: options.currentPage(), at: now() };
    } catch {
      interaction = undefined;
    }
  };

  const handler = (event: Event) => {
    try {
      const target = elementOf(event.target);
      if (!target) return;
      // Typed content is never read: a click inside a typing field, whatever wraps it, is ignored.
      if (target.closest(TYPING_FIELD)) return;
      const control = target.closest(ELIGIBLE);
      if (!control || control.closest('[data-vizoalica-ignore]')) return;

      const kind = kindOf(control);
      const name = nameOf(control, kind);
      const destination = kind === 'link' ? destinationOf(control) : undefined;
      const time = now();
      const page =
        interaction && time - interaction.at < INTERACTION_WINDOW_MS
          ? interaction.page
          : options.currentPage();
      // One press produces one click; a later synthetic click must not reuse it.
      interaction = undefined;

      const key = [page, name, kind, destination?.url_origin, destination?.url_path].join('\0');
      const previous = recent.get(key);
      recent.set(key, time);
      if (recent.size > 200)
        for (const [stale, at] of recent) if (time - at > DUPLICATE_WINDOW_MS) recent.delete(stale);
      if (previous !== undefined && time - previous < DUPLICATE_WINDOW_MS) return;

      while (stamps.length && time - stamps[0]! >= 60_000) stamps.shift();
      if (stamps.length >= MAX_ACTIONS_PER_MINUTE) return;
      stamps.push(time);

      onAction({ name, kind, page, ...(destination ? { destination } : {}) });
    } catch {
      // Analytics must never affect the host page.
    }
  };

  // Passive and capturing: it observes every click without ever changing or delaying one.
  const listen = { capture: true, passive: true } as const;
  doc.addEventListener('pointerdown', begin, listen);
  doc.addEventListener('keydown', begin, listen);
  doc.addEventListener('click', handler, listen);
  return () => {
    doc.removeEventListener('pointerdown', begin, { capture: true });
    doc.removeEventListener('keydown', begin, { capture: true });
    doc.removeEventListener('click', handler, { capture: true });
  };
}
