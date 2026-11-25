import { watchActions } from './actions.js';
import type { ActionData } from '@vizoalica/event-contracts';
import {
  buildActionEvent,
  buildCustomEvent,
  buildPageViewEvent,
  buildStructureEvent,
  resolveAnonymousId,
  resolveSessionId
} from './events.js';
import { resolveIgnore } from './ignore.js';
import { watchNavigation } from './navigation.js';
import { currentPageKey, landingCampaign } from './privacy.js';
import { BoundedQueue } from './queue.js';
import {
  collectStructure,
  learnWindowOpen,
  MAX_STRUCTURE_PER_MINUTE,
  STRUCTURE_SAMPLE_RATE
} from './structure.js';
import { sendBatch } from './transport.js';
import type { TrackOptions, VizoalicaConfig, VizoalicaEvent } from './types.js';

export type { TokenProvider, TrackOptions, VizoalicaConfig, VizoalicaEvent } from './types.js';

export interface VizoalicaClient {
  track(name: string, options?: TrackOptions): void;
  page(): void;
  flush(): Promise<void>;
  /** Stops observing navigation and clicks. Events already queued are still sent by `flush`. */
  stop(): void;
  readonly queuedEvents: number;
}

const ACTION_EVENT = 'com.vizoalica.action.v1';
const STRUCTURE_EVENT = 'com.vizoalica.page_structure.v1';
// Give a single-page app time to render the page before it is described.
const STRUCTURE_DELAY_MS = 1500;
// The backend answered that this batch itself is unacceptable (invalid, or too large). Sending
// it again can never succeed, and keeping it would block every event queued behind it.
const permanentRejection = (status: number | undefined) => status === 400 || status === 413;

/** What `init` returns in a browser that opted out: it answers every call and does nothing. */
const SILENT_CLIENT: VizoalicaClient = {
  track() {},
  page() {},
  flush: async () => {},
  stop() {},
  queuedEvents: 0
};

export function init(config: VizoalicaConfig): VizoalicaClient {
  // Checked first, so an opted-out browser sends nothing, not even the landing page view, and
  // installs no observers.
  if (resolveIgnore()) return SILENT_CLIENT;
  const queue = new BoundedQueue<VizoalicaEvent>(config.maxQueueSize ?? 100);
  const context = {
    anonymousId: resolveAnonymousId(config),
    sessionId: resolveSessionId(config)
  };

  // The campaign belongs to the landing view only, so a visit is not counted again at every route
  // change. It is read now, while the URL is still the landing one.
  let pendingCampaign = landingCampaign();

  async function send(events: VizoalicaEvent[]): Promise<void> {
    if (events.length === 0) return;
    const result = await sendBatch(config, events);
    if (!result.ok && !permanentRejection(result.status)) queue.requeueFront(events);
  }

  async function flush(): Promise<void> {
    const events = queue.drain(25);
    // Actions go in their own batch. A backend that does not know the action type rejects that
    // batch outright, and page views must not be lost with it.
    // Rage clicks are a third batch for the same reason: a backend older than the rage report
    // rejects them, and the clicks recorded alongside must still arrive.
    const isRage = (event: VizoalicaEvent) =>
      event.type === ACTION_EVENT && (event.data as ActionData).action.rage === true;
    // Page structure is its own batch too: a backend that predates it rejects it outright.
    await send(events.filter((event) => event.type !== ACTION_EVENT && event.type !== STRUCTURE_EVENT));
    await send(events.filter((event) => event.type === STRUCTURE_EVENT));
    await send(events.filter((event) => event.type === ACTION_EVENT && !isRage(event)));
    await send(events.filter(isRage));
  }

  // Page structure: only while the learning window is open, never when consent is denied, for a
  // small sample of page loads, once per page key, and at most a few a minute.
  const learnWindow = config.learn?.window;
  const sampled =
    config.consentState !== 'analytics-denied' &&
    Math.random() < (config.learn?.sampleRate ?? STRUCTURE_SAMPLE_RATE);
  const described = new Set<string>();
  const describedAt: number[] = [];
  function describePage(): void {
    try {
      const now = Date.now();
      const open = learnWindow ? learnWindowOpen(now, learnWindow) : learnWindowOpen(now);
      if (!sampled || !open) return;
      const doc = globalThis.document as Document | undefined;
      if (!doc) return;
      const key = currentPageKey();
      if (described.has(key) || described.size >= 50) return;
      described.add(key);
      globalThis.setTimeout(() => {
        try {
          const at = Date.now();
          while (describedAt.length && at - describedAt[0]! >= 60_000) describedAt.shift();
          if (describedAt.length >= MAX_STRUCTURE_PER_MINUTE) return;
          describedAt.push(at);
          queue.enqueue(buildStructureEvent(config, context, key, collectStructure(doc)));
          void flush();
        } catch {
          // Analytics must never affect the host page.
        }
      }, STRUCTURE_DELAY_MS);
    } catch {
      // Analytics must never affect the host page.
    }
  }

  const watchers: Array<() => void> = [];
  const client: VizoalicaClient = {
    track(name: string, options: TrackOptions = {}) {
      queue.enqueue(buildCustomEvent(config, context, name, options.properties));
      void flush();
    },
    page() {
      queue.enqueue(buildPageViewEvent(config, context, pendingCampaign));
      pendingCampaign = undefined;
      void flush();
      describePage();
    },
    flush,
    stop() {
      for (const stopWatching of watchers.splice(0)) stopWatching();
    },
    get queuedEvents() {
      return queue.size;
    }
  };

  if (config.autoPageView ?? true) client.page();
  // The consent state travels on every event. For the richer new data the SDK also stays quiet
  // when consent is explicitly denied.
  if (config.consentState !== 'analytics-denied') {
    // Installing a listener must never be able to break the host page (a frozen `history`, say).
    const observe = (start: () => () => void) => {
      try {
        watchers.push(start());
      } catch {
        // Analytics stays a no-op rather than affecting the page.
      }
    };
    if (config.autoNavigation ?? config.autoPageView ?? true)
      observe(() => watchNavigation(() => client.page(), currentPageKey));
    if (config.autoActions ?? true)
      observe(() =>
        watchActions(
          (observation) => {
            queue.enqueue(buildActionEvent(config, context, observation));
            void flush();
          },
          { currentPage: currentPageKey }
        )
      );
  }
  if (config.flushIntervalMs && config.flushIntervalMs > 0)
    globalThis.setInterval(() => void flush(), config.flushIntervalMs);
  return client;
}
