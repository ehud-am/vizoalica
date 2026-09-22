/** A failure whose message is the whole story; callers print it without a stack. */
export class OpsCoreError extends Error {}

export const DEFAULT_NAMES = {
  worker: 'vizoalica-ingest',
  database: 'vizoalica-config',
  bucket: 'vizoalica-events'
};

/** 3 to 63 lowercase letters, digits, or dashes, starting and ending with a letter or digit. */
export function assertResourceName(kind: string, name: string): void {
  if (!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(name))
    throw new OpsCoreError(
      `${kind} name "${name}" must be 3-63 lowercase letters, digits, or dashes, starting and ending with a letter or digit.`
    );
}

/** A Cloudflare account id: 32 lowercase hex characters. */
export function assertAccountId(id: string): void {
  if (!/^[0-9a-f]{32}$/.test(id)) throw new OpsCoreError(`"${id}" is not a valid account id.`);
}
