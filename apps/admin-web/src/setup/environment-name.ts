/**
 * A client-side preview of the environment-name rule the local service enforces
 * (packages/ops-core's `assertEnvironmentName`, research R26): lowercase letters, digits, and dashes,
 * starting with a letter, short enough that `<name>-vizoalica-worker` stays within Cloudflare's
 * resource-name limit. This only gives instant feedback; the server is the source of truth.
 */
export function assertEnvironmentNameLooksValid(name: string): string | undefined {
  if (!/^[a-z][a-z0-9-]*$/.test(name))
    return 'Use lowercase letters, digits, and dashes, starting with a letter.';
  if (name.length + '-vizoalica-worker'.length > 63) return 'That name is too long.';
  return undefined;
}
