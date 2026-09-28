/** A failure whose message is the whole story; callers print it without a stack. */
export class OpsCoreError extends Error {}

const LONGEST_DEFAULT_SUFFIX = '-vizoalica-worker';
/** Cloudflare's own resource-name limit; the environment prefix must leave room for the suffix above. */
const MAX_RESOURCE_NAME_LENGTH = 63;

/**
 * An environment's name doubles as its Cloudflare resource-name prefix (research R26), so it is
 * validated more strictly than a resource name: lowercase letters, digits, and dashes, starting with a
 * letter, and short enough that `<name>-vizoalica-worker` still fits Cloudflare's resource-name limit.
 */
export function assertEnvironmentName(name: string): void {
  if (!/^[a-z][a-z0-9-]*$/.test(name))
    throw new OpsCoreError(
      `Environment name "${name}" must start with a lowercase letter and contain only lowercase letters, digits, and dashes.`
    );
  if (name.length + LONGEST_DEFAULT_SUFFIX.length > MAX_RESOURCE_NAME_LENGTH)
    throw new OpsCoreError(
      `Environment name "${name}" is too long: "${name}${LONGEST_DEFAULT_SUFFIX}" would exceed Cloudflare's ${MAX_RESOURCE_NAME_LENGTH}-character resource name limit.`
    );
}

/** The default resource names for one environment, each carrying its prefix (research R26). */
export function defaultNames(environment: string): {
  worker: string;
  database: string;
  bucket: string;
} {
  assertEnvironmentName(environment);
  return {
    worker: `${environment}-vizoalica-worker`,
    database: `${environment}-vizoalica-db`,
    bucket: `${environment}-vizoalica-bucket`
  };
}
