import {
  buildCustomEvent,
  buildPageViewEvent,
  resolveAnonymousId,
  resolveSessionId
} from './events.js';
import { BoundedQueue } from './queue.js';
import { sendBatch } from './transport.js';
import type { TrackOptions, VizoalicaConfig, VizoalicaEvent } from './types.js';

export type { TokenProvider, TrackOptions, VizoalicaConfig, VizoalicaEvent } from './types.js';

export interface VizoalicaClient {
  track(name: string, options?: TrackOptions): void;
  page(): void;
  flush(): Promise<void>;
  readonly queuedEvents: number;
}

export function init(config: VizoalicaConfig): VizoalicaClient {
  const queue = new BoundedQueue<VizoalicaEvent>(config.maxQueueSize ?? 100);
  const context = {
    anonymousId: resolveAnonymousId(config),
    sessionId: resolveSessionId(config)
  };

  async function flush(): Promise<void> {
    const events = queue.drain(25);
    const result = await sendBatch(config, events);
    if (!result.ok) queue.requeueFront(events);
  }

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
    get queuedEvents() {
      return queue.size;
    }
  };

  if (config.autoPageView ?? true) client.page();
  if (config.flushIntervalMs && config.flushIntervalMs > 0)
    globalThis.setInterval(() => void flush(), config.flushIntervalMs);
  return client;
}
