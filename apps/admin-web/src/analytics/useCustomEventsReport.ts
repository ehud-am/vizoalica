import { useCallback, useEffect, useState } from 'react';
import { getAnalyticsCustomEvents, type CustomEventsReport } from '../api/local-operations.js';
import type { RouteParams } from '../router.js';
import { useScope } from '../scope/ScopeProvider.js';
import { analyticsErrorMessage } from './AnalyticsProvider.js';
import type { FrameStatus } from './AnalyticsFrame.js';

export interface CustomEventsReportState {
  status: FrameStatus;
  /** Only ever the result for the current scope, range, and selection; cleared while loading. */
  report: CustomEventsReport | undefined;
  error: string;
  retry: () => void;
}

/** Loads the custom events report for the shared scope and range and the selection in the address. */
export function useCustomEventsReport(params: RouteParams | undefined): CustomEventsReportState {
  const { projectId, websiteId, range } = useScope();
  const [state, setState] = useState<Omit<CustomEventsReportState, 'retry'>>({
    status: 'idle',
    report: undefined,
    error: ''
  });
  const [attempt, setAttempt] = useState(0);
  const page = params?.page;
  const event = params?.event;

  useEffect(() => {
    if (!projectId) {
      setState({ status: 'idle', report: undefined, error: '' });
      return;
    }
    const controller = new AbortController();
    setState({ status: 'loading', report: undefined, error: '' });
    getAnalyticsCustomEvents(
      projectId,
      websiteId || undefined,
      range.startUtc,
      range.endUtc,
      { ...(page ? { page } : {}), ...(event ? { event } : {}) },
      controller.signal
    )
      .then((report) => {
        if (!controller.signal.aborted) setState({ status: 'ready', report, error: '' });
      })
      .catch((reason) => {
        if (!controller.signal.aborted)
          setState({ status: 'error', report: undefined, error: analyticsErrorMessage(reason) });
      });
    return () => controller.abort();
  }, [projectId, websiteId, range, page, event, attempt]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  return { ...state, retry };
}
