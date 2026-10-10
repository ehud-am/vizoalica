import type { AdminRepository } from '../../../ingest-api/src/storage/repositories.js';
import type { Principal } from '../../../ingest-api/src/domain/types.js';
import { hasValidAdminAuthorization } from './admin-verifier.js';
import { parseAccessKey, verifySecret } from './access-keys.js';

export type PrincipalResult =
  { principal: Principal } | { error: 'unauthorized' | 'access_keys_unavailable' };

/**
 * Who a request's `Authorization` header identifies: the admin (unchanged, and checked first), the
 * holder of an active access key with its role and scope, or nothing. A database that predates
 * access keys (no `access_keys` table) refuses every key with `unauthorized`, but never blocks the
 * admin, whose path never touches that table.
 */
export async function resolvePrincipal(
  authorization: string | null,
  adminSecret: string,
  repositories: AdminRepository
): Promise<PrincipalResult> {
  if (hasValidAdminAuthorization(authorization, adminSecret))
    return { principal: { role: 'admin' } };
  const match = /^Bearer ([^\s]+)$/.exec(authorization ?? '');
  const parsed = match ? parseAccessKey(match[1]!) : undefined;
  if (!parsed) return { error: 'unauthorized' };
  if (!repositories.findAccessKeyById) return { error: 'access_keys_unavailable' };
  let record;
  try {
    record = await repositories.findAccessKeyById(parsed.id);
  } catch {
    // No `access_keys` table (a database older than this feature): a key can never resolve.
    return { error: 'unauthorized' };
  }
  if (!record || record.revokedAt !== null) return { error: 'unauthorized' };
  if (!(await verifySecret(parsed.secret, record.secretHash))) return { error: 'unauthorized' };
  return {
    principal: { role: record.role, keyId: record.id, keyLabel: record.label, scope: record.scope }
  };
}
