import { resolveToken } from './auth.js';
import type { VizoalicaConfig, VizoalicaEvent } from './types.js';

export interface TransportResult {
  ok: boolean;
  status?: number;
}

export async function sendBatch(
  config: VizoalicaConfig,
  events: VizoalicaEvent[]
): Promise<TransportResult> {
  if (events.length === 0) return { ok: true };
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(
    () => controller.abort(),
    config.transportTimeoutMs ?? 1500
  );
  try {
    const token = await resolveToken(config.tokenProvider);
    const headers: Record<string, string> = {
      'content-type': 'application/cloudevents-batch+json',
      'x-vizoalica-source': config.sourceKey
    };
    if (token) headers.authorization = `Bearer ${token}`;
    const response = await fetch(config.endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(events),
      keepalive: true,
      signal: controller.signal
    });
    return { ok: response.ok, status: response.status };
  } catch {
    return { ok: false };
  } finally {
    globalThis.clearTimeout(timeout);
  }
}
