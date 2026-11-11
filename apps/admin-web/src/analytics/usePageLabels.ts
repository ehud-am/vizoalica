import { useEffect, useMemo, useState } from 'react';
import { getPageLabels, type PageLabel } from '../api/local-operations.js';
import type { RankedRowLabel } from '../components/RankedList.js';
import { useScope } from '../scope/ScopeProvider.js';

/**
 * The names and groups the owner gave to the pages of the selected website. They are display
 * text only: with none, an older backend, or a failed request, pages show their keys as before.
 * Across several websites a page key is ambiguous, so no names are shown there.
 */
export function usePageLabels(): (key: string) => RankedRowLabel {
  const { projectId, websiteId } = useScope();
  const [labels, setLabels] = useState<PageLabel[]>([]);
  useEffect(() => {
    setLabels([]);
    if (!projectId || !websiteId) return;
    const controller = new AbortController();
    getPageLabels(projectId, websiteId, controller.signal)
      .then((found) => {
        if (!controller.signal.aborted && Array.isArray(found)) setLabels(found);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [projectId, websiteId]);
  const byKey = useMemo(() => new Map(labels.map((label) => [label.key, label])), [labels]);
  return (key) => {
    const label = byKey.get(key);
    return label
      ? { name: label.name, secondary: label.group ? `${key} · ${label.group}` : key }
      : { name: key };
  };
}
