import { useEffect, useRef, useState } from 'react';
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
 * The finish line: looks at the parts of the install that fail most often, then reads what
 * actually arrived in the last 24 hours. It answers with one thing to do, never a list of
 * possibilities. It never changes anything, and a check that could not run says so instead of
 * claiming that nothing arrived.
 *
 * `runSignal` starts a check from outside (the "I've deployed" button) each time it changes.
 */
export function InstallCheck({
  website,
  path,
  runSignal = 0
}: {
  website: Website;
  path: InstallPath;
  runSignal?: number;
}) {
  const scope = useScope();
  const [result, setResult] = useState<Result>({ state: 'idle' });
  const lastSignal = useRef(runSignal);

  async function check() {
    setResult({ state: 'checking' });
    const range = presetToRange('24h');
    const [views, reach] = await Promise.allSettled([
      getAnalyticsOverview(scope.projectId, website.id, range.startUtc, range.endUtc),
      getReachability(scope.projectId, website.id, path)
    ]);
    setResult({
      state: 'done',
      pageViews: views.status === 'fulfilled' ? views.value.totals.pageViews : undefined,
      reachability: reach.status === 'fulfilled' ? reach.value : undefined
    });
  }

  useEffect(() => {
    if (runSignal !== lastSignal.current) {
      lastSignal.current = runSignal;
      void check();
    }
    // `check` only reads the current props; the signal alone decides when to run it.
  }, [runSignal]);

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
      <p className="hint">
        The check asks {website.allowedOrigins.length > 1 ? 'each allowed address' : 'your site'}{' '}
        for <code>/vizoalica.js</code> and for a token from your token endpoint. It throws the token
        away unread, and it expires in five minutes.
      </p>
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
        {result.state === 'done' && <Outcome result={result} website={website} path={path} />}
      </div>
    </div>
  );
}

/** One answer: the first thing that is wrong, else whether data has arrived. */
function Outcome({
  result,
  website,
  path
}: {
  result: Extract<Result, { state: 'done' }>;
  website: Website;
  path: InstallPath;
}) {
  const scope = useScope();
  const { pageViews, reachability } = result;
  const install = reachability?.install;
  if (install && install.code !== 'ok')
    return (
      <p className="notice error" data-install-code={install.code}>
        <strong>One thing to fix.</strong> {install.nextAction}
      </p>
    );
  return (
    <>
      {pageViews === undefined ? (
        <p className="notice error">
          The check could not be made. Make sure the local API is running, then try again.
        </p>
      ) : pageViews > 0 ? (
        <p className="notice success">
          <strong>Receiving data.</strong> {pageViews.toLocaleString()}{' '}
          {pageViews === 1 ? 'page view' : 'page views'} from {website.name} in the last 24 hours.{' '}
          <a href={hrefFor('analytics/overview')} onClick={() => scope.selectWebsite(website.id)}>
            View analytics
          </a>
        </p>
      ) : (
        <p className="notice">
          <strong>No page views yet</strong> in the last 24 hours. Open your website, allow
          analytics, wait a minute or two (new page views take a short while to appear), and check
          again. If nothing arrives, look at{' '}
          <a href={hrefFor('manage/health')} onClick={() => scope.selectWebsite(website.id)}>
            Health
          </a>{' '}
          for the next step.
        </p>
      )}
      {/* An older local API has no install answer; the configuration file check is what remains. */}
      {path === 'github' &&
        !install &&
        (reachability ? (
          <p className={reachability.configEndpointReachable ? 'notice success' : 'notice error'}>
            {reachability.configEndpointReachable
              ? 'Configuration file reachable.'
              : `Configuration file not reachable${
                  reachability.configEndpointError
                    ? `: ${REACH_ERRORS[reachability.configEndpointError] ?? reachability.configEndpointError}`
                    : ''
                }. Check that the deploy finished and that the loader and workflow settings match.`}
          </p>
        ) : (
          <p className="notice">The configuration file could not be checked.</p>
        ))}
    </>
  );
}
