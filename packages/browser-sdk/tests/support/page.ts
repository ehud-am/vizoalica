import { vi } from 'vitest';

/** Sets the page address without firing navigation events (like a router's replaceState). */
export function setUrl(path: string): void {
  history.replaceState({}, '', path);
}

export function mount(html: string): void {
  document.body.innerHTML = html;
}

/** A keyboard activation is reported by browsers as a click with `detail` 0. */
export function keyboardActivate(element: Element): void {
  element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 0 }));
}

export function click(element: Element): void {
  element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }));
}

export interface CapturedRequest {
  events: Array<{ type: string; data: any }>;
}

/** Replaces `fetch` and records every posted batch. `status` may vary per call. */
export function captureFetch(
  status: number | ((events: CapturedRequest['events']) => number) = 202
) {
  const requests: CapturedRequest[] = [];
  const mock = vi.fn(async (_url: unknown, init?: RequestInit) => {
    const events = JSON.parse(String(init?.body ?? '[]')) as CapturedRequest['events'];
    requests.push({ events });
    return new Response('{}', { status: typeof status === 'function' ? status(events) : status });
  });
  vi.stubGlobal('fetch', mock);
  return {
    requests,
    mock,
    events: (type?: string) =>
      requests.flatMap((request) => request.events).filter((e) => !type || e.type === type)
  };
}

export const flushMicrotasks = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
