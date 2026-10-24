import { useCallback, useEffect, useState } from 'react';
import {
  ApiError,
  getAnalyticsRageClicks,
  type RageClicksReport
} from '../api/local-operations.js';
import { useScope } from '../scope/ScopeProvider.js';
import { analyticsErrorMessage } from './AnalyticsProvider.js';
import type { FrameStatus } from './AnalyticsFrame.js';

export interface RageClicksReportState {
  status: FrameStatus;
  /** Only ever the result for the current scope and range; cleared while loading. */
  report: RageClicksReport | undefined;
  error: string;
  retry: () => void;
}

/** Loads the rage clicks report for the shared scope and range. */
export function useRageClicksReport(): RageClicksReportState {
  const { projectId, websiteId, range } = useScope();
  const [state, setState] = useState<Omit<RageClicksReportState, 'retry'>>({
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
    const controller = new AbortController();
    setState({ status: 'loading', report: undefined, error: '' });
    getAnalyticsRageClicks(
      projectId,
      websiteId || undefined,
      range.startUtc,
      range.endUtc,
      controller.signal
    )
      .then((report) => {
        if (!controller.signal.aborted) setState({ status: 'ready', report, error: '' });
      })
      .catch((reason) => {
        if (!controller.signal.aborted)
          setState({
            status: 'error',
            report: undefined,
            // The project was just listed, so a 404 here is a backend that predates the report.
            error:
              reason instanceof ApiError && reason.status === 404
                ? 'This backend does not report rage clicks yet. Update it with vizoalica deploy <name> --update.'
                : analyticsErrorMessage(reason)
          });
      });
    return () => controller.abort();
  }, [projectId, websiteId, range, attempt]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  return { ...state, retry };
}
