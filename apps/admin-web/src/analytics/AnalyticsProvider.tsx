import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from 'react';
import { ApiError, getAnalyticsOverview, type AnalyticsOverview } from '../api/local-operations.js';
import { useScope } from '../scope/ScopeProvider.js';
import { comparisonState, previousRange, type ComparisonState } from './comparison.js';

export interface PreviousPeriod {
  /** 'loading' until the earlier range answers; the current period never waits for it. */
  state: ComparisonState | 'loading';
  totals?: AnalyticsOverview['totals'];
}

export interface AnalyticsValue {
  status: 'idle' | 'loading' | 'ready' | 'error';
  /** Only ever the result for the current scope and range; cleared while a new one loads. */
  overview: AnalyticsOverview | undefined;
  previous: PreviousPeriod;
  error: string;
  retry: () => void;
}

const AnalyticsContext = createContext<AnalyticsValue | undefined>(undefined);

export function useAnalytics(): AnalyticsValue {
  const value = useContext(AnalyticsContext);
  if (!value) throw new Error('useAnalytics must be used inside AnalyticsProvider');
  return value;
}

/** The one wording for a failed analytics request, shared by every Analytics view. */
export function analyticsErrorMessage(reason: unknown): string {
  if (reason instanceof ApiError && reason.status === 401)
    return reason.code === 'session_expired'
      ? 'Your browser session expired. Reconnect to the local workspace.'
      : 'The Worker rejected the configured credential. Run pnpm vizoalica status.';
  return 'Analytics are unavailable. No stale results are shown.';
}

/**
 * Loads the overview once per scope and range so every Analytics view shares it. When
 * `comparePrevious` is set (only the Overview shows change indicators) it also loads the preceding
 * equal-length period, totals only, without ever holding up the current period.
 */
export function AnalyticsProvider({
  children,
  comparePrevious = true
}: {
  children: ReactNode;
  comparePrevious?: boolean;
}) {
  const { projectId, websiteId, range } = useScope();
  const [state, setState] = useState<{
    status: AnalyticsValue['status'];
    overview: AnalyticsOverview | undefined;
    error: string;
  }>({ status: 'idle', overview: undefined, error: '' });
  const [previous, setPrevious] = useState<PreviousPeriod>({ state: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!projectId) {
      setState({ status: 'idle', overview: undefined, error: '' });
      return;
    }
    const controller = new AbortController();
    setState({ status: 'loading', overview: undefined, error: '' });
    getAnalyticsOverview(
      projectId,
      websiteId || undefined,
      range.startUtc,
      range.endUtc,
      controller.signal
    )
      .then((overview) => {
        if (!controller.signal.aborted) setState({ status: 'ready', overview, error: '' });
      })
      .catch((reason) => {
        if (!controller.signal.aborted)
          setState({ status: 'error', overview: undefined, error: analyticsErrorMessage(reason) });
      });
    return () => controller.abort();
  }, [projectId, websiteId, range, attempt]);

  useEffect(() => {
    setPrevious({ state: 'loading' });
    if (!projectId || !comparePrevious) return;
    const controller = new AbortController();
    const earlier = previousRange(range);
    getAnalyticsOverview(
      projectId,
      websiteId || undefined,
      earlier.startUtc,
      earlier.endUtc,
      controller.signal
    )
      .then((overview) => {
        if (!controller.signal.aborted)
          setPrevious({ state: comparisonState(overview), totals: overview.totals });
      })
      .catch(() => {
        if (!controller.signal.aborted) setPrevious({ state: 'unavailable' });
      });
    return () => controller.abort();
  }, [projectId, websiteId, range, attempt, comparePrevious]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  const value = useMemo(() => ({ ...state, previous, retry }), [state, previous, retry]);
  return <AnalyticsContext.Provider value={value}>{children}</AnalyticsContext.Provider>;
}
