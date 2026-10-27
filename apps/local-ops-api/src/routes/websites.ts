import { WorkerClient } from '../remote-client/worker-client.js';
import { parseAddressList } from '../../../ingest-api/src/ingestion/address-match.js';
import { isSafeId, validName, validOrigins } from '../contracts.js';

export async function workerJson(client: WorkerClient, path: string, init?: RequestInit) {
  const response = await client.request(path, init);
  if (response.status === 401 || response.status === 403) throw new Error('access_revoked');
  if (!response.ok) {
    if (response.status === 503 && (await databaseUpdateNeeded(response)))
      throw new Error('database_update_needed');
    if (response.status === 400) throw new Error('invalid_request');
    if (response.status === 404) throw new Error('not_found');
    throw new Error('remote_unavailable');
  }
  return response.status === 204 ? undefined : response.json();
}

/** A Worker newer than its database answers 503 with this error; the person needs the next step. */
export async function databaseUpdateNeeded(response: Response): Promise<boolean> {
  const body = (await response
    .clone()
    .json()
    .catch(() => undefined)) as { error?: unknown } | undefined;
  return body?.error === 'database_update_needed';
}

export function jsonInit(method: 'POST' | 'PATCH' | 'DELETE', body?: unknown): RequestInit {
  return body === undefined
    ? { method }
    : { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) };
}

export function validateProjectBody(body: unknown): { name: string } {
  const name = (body as { name?: unknown } | undefined)?.name;
  if (!validName(name)) throw new Error('invalid_request');
  return { name: name.trim() };
}

/**
 * An excluded-address list the console sent that is not valid. It says which entry (by position) and
 * why, but never repeats the text, so addresses do not travel back in errors.
 */
export class InvalidExcludedAddresses extends Error {
  constructor(
    readonly reason: 'not_a_list' | 'too_many' | 'invalid_entry',
    readonly index?: number
  ) {
    super('invalid_request');
  }
}

export function validateWebsiteBody(body: unknown, partial = false) {
  const value = body as
    | {
        name?: unknown;
        allowedOrigins?: unknown;
        status?: unknown;
        tokenRequired?: unknown;
        excludedAddresses?: unknown;
        pixelEnabled?: unknown;
      }
    | undefined;
  if (!value || (!partial && (!validName(value.name) || !validOrigins(value.allowedOrigins))))
    throw new Error('invalid_request');
  if (value.name !== undefined && !validName(value.name)) throw new Error('invalid_request');
  if (value.allowedOrigins !== undefined && !validOrigins(value.allowedOrigins))
    throw new Error('invalid_request');
  if (value.status !== undefined && value.status !== 'active' && value.status !== 'disabled')
    throw new Error('invalid_request');
  if (value.tokenRequired !== undefined && typeof value.tokenRequired !== 'boolean')
    throw new Error('invalid_request');
  if (value.pixelEnabled !== undefined && typeof value.pixelEnabled !== 'boolean')
    throw new Error('invalid_request');
  const excluded =
    value.excludedAddresses === undefined ? undefined : parseAddressList(value.excludedAddresses);
  if (excluded && !excluded.ok) throw new InvalidExcludedAddresses(excluded.reason, excluded.index);
  if (
    partial &&
    value.name === undefined &&
    value.allowedOrigins === undefined &&
    value.status === undefined &&
    value.tokenRequired === undefined &&
    value.pixelEnabled === undefined &&
    excluded === undefined
  )
    throw new Error('invalid_request');
  return {
    ...(value.name !== undefined ? { name: value.name.trim() } : {}),
    ...(value.allowedOrigins !== undefined ? { allowedOrigins: value.allowedOrigins } : {}),
    ...(value.status !== undefined ? { status: value.status } : {}),
    ...(value.tokenRequired !== undefined ? { tokenRequired: value.tokenRequired } : {}),
    ...(value.pixelEnabled !== undefined ? { pixelEnabled: value.pixelEnabled } : {}),
    ...(excluded?.ok ? { excludedAddresses: excluded.entries } : {})
  };
}

export function assertSafeIds(...ids: string[]): void {
  if (!ids.every(isSafeId)) throw new Error('invalid_request');
}
