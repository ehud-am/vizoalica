import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from 'react';
import { listWebsites, type Project, type Website } from '../api/local-operations.js';
import {
  DEFAULT_RANGE_PRESET,
  RANGE_PRESETS,
  presetToRange,
  type AppliedRange
} from '../time-range.js';

const STORAGE_KEY = 'vizoalica.console.scope';

interface Saved {
  projectId: string;
  websiteId: string;
  range: { kind: 'preset'; preset: string } | { kind: 'custom'; startUtc: string; endUtc: string };
}

// Browser storage is only a per-viewer convenience: it can be blocked or empty, so every access
// is guarded and the console behaves the same (just without memory) when it fails.
function readSaved(): Partial<Saved> {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Partial<Saved>) : {};
  } catch {
    return {};
  }
}

function writeSaved(saved: Saved): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
  } catch {
    // Not remembering the last scope is acceptable.
  }
}

function savedRange(saved: Partial<Saved>): AppliedRange {
  const range = saved.range;
  if (range?.kind === 'preset') {
    const preset = RANGE_PRESETS.find((item) => item.value === range.preset);
    if (preset) return presetToRange(preset.value);
  }
  if (
    range?.kind === 'custom' &&
    Number.isFinite(Date.parse(range.startUtc)) &&
    Number.isFinite(Date.parse(range.endUtc))
  )
    return { kind: 'custom', startUtc: range.startUtc, endUtc: range.endUtc };
  return presetToRange(DEFAULT_RANGE_PRESET);
}

export interface ScopeValue {
  /** Every project the Worker returned, including deleted ones (Manage lists those separately). */
  projects: Project[];
  /** Projects that can be chosen as the current scope. */
  activeProjects: Project[];
  projectId: string;
  websiteId: string;
  project: Project | undefined;
  website: Website | undefined;
  /** Websites of the current project that are not deleted. */
  websites: Website[];
  websitesError: boolean;
  range: AppliedRange;
  /** Set when a remembered or current scope had to fall back; explains what changed. */
  notice: string;
  setProjects: (next: Project[], preferredProjectId?: string) => void;
  selectProject: (id: string) => void;
  selectWebsite: (id: string) => void;
  setRange: (range: AppliedRange) => void;
  refreshWebsites: () => Promise<Website[]>;
  dismissNotice: () => void;
}

const ScopeContext = createContext<ScopeValue | undefined>(undefined);

export function useScope(): ScopeValue {
  const value = useContext(ScopeContext);
  if (!value) throw new Error('useScope must be used inside ScopeProvider');
  return value;
}

const isActive = (project: Project) => project.status !== 'deleted';

export function ScopeProvider({
  initialProjects,
  children
}: {
  initialProjects: Project[];
  children: ReactNode;
}) {
  const saved = useRef<Partial<Saved>>(readSaved());
  const [initial] = useState(() => {
    const active = initialProjects.filter(isActive);
    const wanted = saved.current.projectId;
    if (wanted && active.some((project) => project.id === wanted))
      return { projectId: wanted, notice: '' };
    return {
      projectId: active[0]?.id ?? '',
      notice:
        wanted && active[0]
          ? `Your previous project is no longer available. Showing ${active[0].name}.`
          : ''
    };
  });
  const [projects, setProjectList] = useState(initialProjects);
  const [notice, setNotice] = useState(initial.notice);
  const [projectId, setProjectId] = useState(initial.projectId);
  const [websiteId, setWebsiteId] = useState('');
  const [websites, setWebsites] = useState<Website[]>([]);
  const [websitesError, setWebsitesError] = useState(false);
  const [range, setRangeState] = useState<AppliedRange>(() => savedRange(saved.current));
  // Remembered website, applied once when the first website list for the remembered project loads.
  const pendingWebsite = useRef(
    saved.current.projectId === initial.projectId ? saved.current.websiteId : undefined
  );

  const loadWebsites = useCallback(async (id: string): Promise<Website[]> => {
    const items = (await listWebsites(id)).filter((item) => item.status !== 'deleted');
    return items;
  }, []);

  useEffect(() => {
    setWebsites([]);
    setWebsitesError(false);
    if (!projectId) return;
    let cancelled = false;
    loadWebsites(projectId)
      .then((items) => {
        if (cancelled) return;
        setWebsites(items);
        const wanted = pendingWebsite.current;
        pendingWebsite.current = undefined;
        if (wanted) {
          if (items.some((item) => item.id === wanted)) setWebsiteId(wanted);
          else setNotice('Your previous website is no longer available. Showing all websites.');
        }
      })
      .catch(() => {
        if (!cancelled) setWebsitesError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, loadWebsites]);

  useEffect(() => {
    writeSaved({
      projectId,
      websiteId,
      range:
        range.kind === 'preset'
          ? { kind: 'preset', preset: range.preset }
          : { kind: 'custom', startUtc: range.startUtc, endUtc: range.endUtc }
    });
  }, [projectId, websiteId, range]);

  const setProjects = useCallback((next: Project[], preferredProjectId?: string) => {
    setProjectList(next);
    setProjectId((current) => {
      const active = next.filter(isActive);
      if (preferredProjectId && active.some((project) => project.id === preferredProjectId)) {
        if (preferredProjectId !== current) setWebsiteId('');
        return preferredProjectId;
      }
      if (current && active.some((project) => project.id === current)) return current;
      if (current) {
        setNotice(
          active[0]
            ? `The previous project is no longer available. Showing ${active[0].name}.`
            : 'The previous project is no longer available.'
        );
      }
      setWebsiteId('');
      return active[0]?.id ?? '';
    });
  }, []);

  const selectProject = useCallback((id: string) => {
    setProjectId(id);
    setWebsiteId('');
    setNotice('');
  }, []);

  const refreshWebsites = useCallback(async () => {
    if (!projectId) return [];
    const items = await loadWebsites(projectId);
    setWebsites(items);
    setWebsitesError(false);
    setWebsiteId((current) =>
      current && !items.some((item) => item.id === current) ? '' : current
    );
    return items;
  }, [projectId, loadWebsites]);

  const value = useMemo<ScopeValue>(
    () => ({
      projects,
      activeProjects: projects.filter(isActive),
      projectId,
      websiteId,
      project: projects.find((project) => project.id === projectId),
      website: websites.find((website) => website.id === websiteId),
      websites,
      websitesError,
      range,
      notice,
      setProjects,
      selectProject,
      selectWebsite: setWebsiteId,
      setRange: setRangeState,
      refreshWebsites,
      dismissNotice: () => setNotice('')
    }),
    [
      projects,
      projectId,
      websiteId,
      websites,
      websitesError,
      range,
      notice,
      setProjects,
      selectProject,
      refreshWebsites
    ]
  );
  return <ScopeContext.Provider value={value}>{children}</ScopeContext.Provider>;
}
