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

function messageFor(reason: unknown): string {
  if (reason instanceof ApiError && reason.status === 401)
    return reason.code === 'session_expired'
      ? 'Your browser session expired. Reconnect to the local workspace.'
      : 'The Worker rejected the configured credential. Run pnpm vizoalica status.';
  return 'Analytics are unavailable. No stale results are shown.';
}

/**
 * Loads the overview once per scope and range so every Analytics view shares it, plus the
 * preceding equal-length period (totals only) for the change indicators.
 */
export function AnalyticsProvider({ children }: { children: ReactNode }) {
  const { projectId, websiteId, range } = useScope();
  const [state, setState] = useState<Omit<AnalyticsValue, 'retry'>>({
    status: 'idle',
    overview: undefined,
    previous: { state: 'loading' },
    error: ''
  });
  const [attempt, setAttempt] = useState(0);
  const generation = useRef(0);

  useEffect(() => {
    if (!projectId) {
      setState({ status: 'idle', overview: undefined, previous: { state: 'loading' }, error: '' });
      return;
    }
    const controller = new AbortController();
    const current = ++generation.current;
    const live = () => generation.current === current && !controller.signal.aborted;
    setState({ status: 'loading', overview: undefined, previous: { state: 'loading' }, error: '' });
    const site = websiteId || undefined;
    getAnalyticsOverview(projectId, site, range.startUtc, range.endUtc, controller.signal)
      .then((overview) => {
        if (live()) setState((prior) => ({ ...prior, status: 'ready', overview }));
      })
      .catch((reason) => {
        if (live()) setState((prior) => ({ ...prior, status: 'error', error: messageFor(reason) }));
      });
    const earlier = previousRange(range);
    getAnalyticsOverview(projectId, site, earlier.startUtc, earlier.endUtc, controller.signal)
      .then((overview) => {
        if (live())
          setState((prior) => ({
            ...prior,
            previous: { state: comparisonState(overview), totals: overview.totals }
          }));
      })
      .catch(() => {
        if (live()) setState((prior) => ({ ...prior, previous: { state: 'unavailable' } }));
      });
    return () => controller.abort();
  }, [projectId, websiteId, range, attempt]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  const value = useMemo(() => ({ ...state, retry }), [state, retry]);
  return <AnalyticsContext.Provider value={value}>{children}</AnalyticsContext.Provider>;
}
