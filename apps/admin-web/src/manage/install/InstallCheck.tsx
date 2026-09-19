import { useState } from 'react';
import {
  getAnalyticsOverview,
  getReachability,
  type Reachability,
  type Website
} from '../../api/local-operations.js';
import { hrefFor } from '../../router.js';
import { useScope } from '../../scope/ScopeProvider.js';
import { presetToRange } from '../../time-range.js';
import type { InstallPath } from './paths.js';

type Result =
  | { state: 'idle' }
  | { state: 'checking' }
  | {
      state: 'done';
      /** Undefined when the page-view check itself failed. */
      pageViews: number | undefined;
      /** Only on the GitHub path; undefined when it failed or does not apply. */
      reachability: Reachability | undefined;
    };

const REACH_ERRORS: Record<string, string> = {
  invalid_origin: 'the website has no valid origin configured',
  malformed_response: 'the configuration file returned an unexpected response',
  network_error: 'the website could not be reached'
};

/**
 * The finish line: reads what actually arrived in the last 24 hours. It never changes anything,
 * and a check that could not run says so instead of claiming that nothing arrived.
 */
export function InstallCheck({ website, path }: { website: Website; path: InstallPath }) {
  const scope = useScope();
  const [result, setResult] = useState<Result>({ state: 'idle' });

  async function check() {
    setResult({ state: 'checking' });
    const range = presetToRange('24h');
    const [views, reach] = await Promise.allSettled([
      getAnalyticsOverview(scope.projectId, website.id, range.startUtc, range.endUtc),
      path === 'github' ? getReachability(scope.projectId, website.id) : Promise.resolve(undefined)
    ]);
    setResult({
      state: 'done',
      pageViews: views.status === 'fulfilled' ? views.value.totals.pageViews : undefined,
      reachability: reach.status === 'fulfilled' ? reach.value : undefined
    });
  }

  const origin = website.allowedOrigins[0];
  return (
    <div className="install-check">
      <p>
        Open{' '}
        {origin ? (
          <a href={origin} target="_blank" rel="noopener noreferrer">
            {origin}
          </a>
        ) : (
          'your website'
        )}
        , allow analytics when your consent banner asks, then check for data.
      </p>
      {website.status === 'disabled' && (
        <p className="notice" role="status">
          This website is disabled, so it will not collect anything until you enable it.
        </p>
      )}
      <button
        className="primary"
        type="button"
        disabled={result.state === 'checking'}
        onClick={() => void check()}
      >
        {result.state === 'checking'
          ? 'Checking…'
          : result.state === 'done'
            ? 'Check again'
            : 'Check now'}
      </button>

      <div
        className="check-result"
        role="status"
        aria-live="polite"
        aria-busy={result.state === 'checking'}
      >
        {result.state === 'done' && (
          <>
            {result.pageViews === undefined ? (
              <p className="notice error">
                The check could not be made. Make sure the local API is running, then try again.
              </p>
            ) : result.pageViews > 0 ? (
              <p className="notice success">
                <strong>Receiving data.</strong> {result.pageViews.toLocaleString()}{' '}
                {result.pageViews === 1 ? 'page view' : 'page views'} from {website.name} in the
                last 24 hours.{' '}
                <a
                  href={hrefFor('analytics/overview')}
                  onClick={() => scope.selectWebsite(website.id)}
                >
                  View analytics
                </a>
              </p>
            ) : (
              <p className="notice">
                <strong>No page views yet</strong> in the last 24 hours. Open your website, allow
                analytics, wait a minute or two (new page views take a short while to appear), and
                check again. If nothing arrives, look at{' '}
                <a href={hrefFor('manage/health')} onClick={() => scope.selectWebsite(website.id)}>
                  Health
                </a>{' '}
                for the next step.
              </p>
            )}
            {path === 'github' &&
              (result.reachability ? (
                <p
                  className={
                    result.reachability.configEndpointReachable ? 'notice success' : 'notice error'
                  }
                >
                  {result.reachability.configEndpointReachable
                    ? 'Configuration file reachable.'
                    : `Configuration file not reachable${
                        result.reachability.configEndpointError
                          ? `: ${REACH_ERRORS[result.reachability.configEndpointError] ?? result.reachability.configEndpointError}`
                          : ''
                      }. Check that the deploy finished and that the loader and workflow settings match.`}
                </p>
              ) : (
                <p className="notice">The configuration file could not be checked.</p>
              ))}
          </>
        )}
      </div>
    </div>
  );
}
