import type { TokenClaims } from '@vizoalica/event-contracts';
import type { Project, Source } from '../domain/types.js';

export type SourceAuthorizationResult =
  | { ok: true; project: Project; source: Source }
  | {
      ok: false;
      reason:
        | 'source_not_found'
        | 'source_disabled'
        | 'project_not_found'
        | 'project_deleted'
        | 'origin_not_allowed'
        | 'token_source_mismatch';
    };

export interface SourceLookup {
  findProject(id: string): Promise<Project | undefined>;
  findSourceByPublicKey(publicSourceKey: string): Promise<Source | undefined>;
}

export async function authorizeSource(input: {
  repositories: SourceLookup;
  publicSourceKey: string;
  origin?: string | null;
  claims?: TokenClaims;
}): Promise<SourceAuthorizationResult> {
  const source = await input.repositories.findSourceByPublicKey(input.publicSourceKey);
  if (!source) return { ok: false, reason: 'source_not_found' };
  // Deny by default for any non-active status (disabled, deleted, or a future
  // status) rather than only blocking 'disabled' — a soft-deleted source must
  // stop accepting events, not just disappear from the console.
  if (source.status !== 'active') return { ok: false, reason: 'source_disabled' };
  const project = await input.repositories.findProject(source.projectId);
  if (!project) return { ok: false, reason: 'project_not_found' };
  if (project.status !== 'active') return { ok: false, reason: 'project_deleted' };
  if (
    input.claims &&
    (input.claims.project_id !== project.id || input.claims.source_id !== source.id)
  ) {
    return { ok: false, reason: 'token_source_mismatch' };
  }
  const origin = input.origin ?? input.claims?.origin;
  if (origin && !source.allowedOrigins.includes(origin))
    return { ok: false, reason: 'origin_not_allowed' };
  return { ok: true, project, source };
}
