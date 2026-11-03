import { useCallback, useEffect, useState } from 'react';
import { ApiError, getGoalsReport, type GoalsReport } from '../api/local-operations.js';
import { useScope } from '../scope/ScopeProvider.js';
import { analyticsErrorMessage } from './AnalyticsProvider.js';
import type { FrameStatus } from './AnalyticsFrame.js';

export interface GoalsReportState {
  status: FrameStatus;
  /** Only ever the result for the current website and range; cleared while loading. */
  report: GoalsReport | undefined;
  error: string;
  retry: () => void;
}

/** Loads the goals report for the selected website and range. Goals belong to one website. */
export function useGoalsReport(): GoalsReportState {
  const { projectId, websiteId, range } = useScope();
  const [state, setState] = useState<Omit<GoalsReportState, 'retry'>>({
    status: 'idle',
    report: undefined,
    error: ''
  });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!projectId) {
      setState({ status: 'idle', report: undefined, error: '' });
      return;
    }
    // Goals belong to one website: with none chosen there is nothing to load, and the page says so.
    if (!websiteId) {
      setState({ status: 'ready', report: undefined, error: '' });
      return;
    }
    const controller = new AbortController();
    setState({ status: 'loading', report: undefined, error: '' });
    getGoalsReport(projectId, websiteId, range.startUtc, range.endUtc, controller.signal)
      .then((report) => {
        if (!controller.signal.aborted) setState({ status: 'ready', report, error: '' });
      })
      .catch((reason) => {
        if (!controller.signal.aborted)
          setState({
            status: 'error',
            report: undefined,
            error:
              reason instanceof ApiError && reason.status === 404
                ? 'This backend does not report goals yet. Update it with vizoalica deploy <name> --update.'
                : analyticsErrorMessage(reason)
          });
      });
    return () => controller.abort();
  }, [projectId, websiteId, range, attempt]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  return { ...state, retry };
}
