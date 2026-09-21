import { useCallback, useEffect, useState } from 'react';
import { getAnalyticsActions, type ActionsReport } from '../api/local-operations.js';
import type { RouteParams } from '../router.js';
import { useScope } from '../scope/ScopeProvider.js';
import { analyticsErrorMessage } from './AnalyticsProvider.js';
import type { FrameStatus } from './AnalyticsFrame.js';

export interface ActionsReportState {
  status: FrameStatus;
  /** Only ever the result for the current scope, range, and selection; cleared while loading. */
  report: ActionsReport | undefined;
  error: string;
  retry: () => void;
}

/** Loads the actions report for the shared scope and range and the selection in the address. */
export function useActionsReport(params: RouteParams | undefined): ActionsReportState {
  const { projectId, websiteId, range } = useScope();
  const [state, setState] = useState<Omit<ActionsReportState, 'retry'>>({
    status: 'idle',
    report: undefined,
    error: ''
  });
  const [attempt, setAttempt] = useState(0);
  const page = params?.page;
  const action = params?.action;

  useEffect(() => {
    if (!projectId) {
      setState({ status: 'idle', report: undefined, error: '' });
      return;
    }
    const controller = new AbortController();
    setState({ status: 'loading', report: undefined, error: '' });
    getAnalyticsActions(
      projectId,
      websiteId || undefined,
      range.startUtc,
      range.endUtc,
      { ...(page ? { page } : {}), ...(action ? { action } : {}) },
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
  }, [projectId, websiteId, range, page, action, attempt]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  return { ...state, retry };
}
