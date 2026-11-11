import type { PageLabel } from '../domain/types.js';
import { isStorablePageKey } from './page-key.js';

/** Page labels per website; a name is at most 80 characters and a group at most 60. */
export const MAX_PAGE_LABELS = 500;

const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;

export type LabelsResult =
  { ok: true; labels: PageLabel[] } | { ok: false; reason: string; index?: number };

/**
 * Validates page labels: a page key as the reports show it, a name, and an optional group. A key
 * appears once. The refusal names the position of the label and the reason.
 */
export function parsePageLabels(value: unknown): LabelsResult {
  if (!Array.isArray(value)) return { ok: false, reason: 'not_a_list' };
  if (value.length > MAX_PAGE_LABELS) return { ok: false, reason: 'too_many' };
  const seen = new Set<string>();
  const labels: PageLabel[] = [];
  for (const [index, item] of value.entries()) {
    const entry = item as { key?: unknown; name?: unknown; group?: unknown } | null;
    const key = typeof entry?.key === 'string' ? entry.key : '';
    const name = typeof entry?.name === 'string' ? entry.name.trim() : '';
    const group = entry?.group === undefined || entry.group === null ? '' : entry.group;
    if (
      !key.startsWith('/') ||
      key.length > 512 ||
      key.includes('?') ||
      CONTROL_CHARACTERS.test(key) ||
      !isStorablePageKey(key)
    )
      return { ok: false, reason: 'invalid_key', index };
    if (seen.has(key)) return { ok: false, reason: 'duplicate_key', index };
    if (!name || name.length > 80 || CONTROL_CHARACTERS.test(name))
      return { ok: false, reason: 'invalid_name', index };
    if (typeof group !== 'string' || group.trim().length > 60 || CONTROL_CHARACTERS.test(group))
      return { ok: false, reason: 'invalid_group', index };
    seen.add(key);
    labels.push({ key, name, group: group.trim() });
  }
  return { ok: true, labels };
}
