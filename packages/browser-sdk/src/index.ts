import { watchActions } from './actions.js';
import {
  buildActionEvent,
  buildCustomEvent,
  buildPageViewEvent,
  resolveAnonymousId,
  resolveSessionId
} from './events.js';
import { watchNavigation } from './navigation.js';
import { currentPageKey } from './privacy.js';
import { BoundedQueue } from './queue.js';
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
// The backend answered that this batch itself is unacceptable (invalid, or too large). Sending
// it again can never succeed, and keeping it would block every event queued behind it.
const permanentRejection = (status: number | undefined) => status === 400 || status === 413;

export function init(config: VizoalicaConfig): VizoalicaClient {
  const queue = new BoundedQueue<VizoalicaEvent>(config.maxQueueSize ?? 100);
  const context = {
    anonymousId: resolveAnonymousId(config),
    sessionId: resolveSessionId(config)
  };

  async function send(events: VizoalicaEvent[]): Promise<void> {
    if (events.length === 0) return;
    const result = await sendBatch(config, events);
    if (!result.ok && !permanentRejection(result.status)) queue.requeueFront(events);
  }

  async function flush(): Promise<void> {
    const events = queue.drain(25);
    // Actions go in their own batch. A backend that does not know the action type rejects that
    // batch outright, and page views must not be lost with it.
    await send(events.filter((event) => event.type !== ACTION_EVENT));
    await send(events.filter((event) => event.type === ACTION_EVENT));
  }

  const watchers: Array<() => void> = [];
  const client: VizoalicaClient = {
    track(name: string, options: TrackOptions = {}) {
      queue.enqueue(buildCustomEvent(config, context, name, options.properties));
      void flush();
    },
    page() {
      queue.enqueue(buildPageViewEvent(config, context));
      void flush();
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
    if (config.autoNavigation ?? config.autoPageView ?? true)
      watchers.push(watchNavigation(() => client.page(), currentPageKey));
    if (config.autoActions ?? true)
      watchers.push(
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
