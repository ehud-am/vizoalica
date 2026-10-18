import { useCallback, useEffect, useState } from 'react';
import { ApiError, getAnalyticsCampaigns, type CampaignsReport } from '../api/local-operations.js';
import type { RouteParams } from '../router.js';
import { useScope } from '../scope/ScopeProvider.js';
import { analyticsErrorMessage } from './AnalyticsProvider.js';
import type { FrameStatus } from './AnalyticsFrame.js';

export interface CampaignsReportState {
  status: FrameStatus;
  /** Only ever the result for the current scope, range, and selection; cleared while loading. */
  report: CampaignsReport | undefined;
  error: string;
  retry: () => void;
}

/** Loads the campaigns report for the shared scope and range and the selection in the address. */
export function useCampaignsReport(params: RouteParams | undefined): CampaignsReportState {
  const { projectId, websiteId, range } = useScope();
  const [state, setState] = useState<Omit<CampaignsReportState, 'retry'>>({
    status: 'idle',
    report: undefined,
    error: ''
  });
  const [attempt, setAttempt] = useState(0);
  const source = params?.source;
  const medium = params?.medium;
  const campaign = params?.campaign;

  useEffect(() => {
    if (!projectId) {
      setState({ status: 'idle', report: undefined, error: '' });
      return;
    }
    const controller = new AbortController();
    setState({ status: 'loading', report: undefined, error: '' });
    getAnalyticsCampaigns(
      projectId,
      websiteId || undefined,
      range.startUtc,
      range.endUtc,
      {
        ...(source ? { source } : {}),
        ...(medium ? { medium } : {}),
        ...(campaign ? { campaign } : {})
      },
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
                ? 'This backend does not report campaigns yet. Update it with vizoalica deploy <name> --update.'
                : analyticsErrorMessage(reason)
          });
      });
    return () => controller.abort();
  }, [projectId, websiteId, range, source, medium, campaign, attempt]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  return { ...state, retry };
}
