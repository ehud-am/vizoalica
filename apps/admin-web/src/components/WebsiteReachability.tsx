import type { Reachability } from '../api/local-operations.js';

const ERROR_LABELS: Record<string, string> = {
  invalid_origin: 'the website has no valid origin configured',
  malformed_response: 'the configuration endpoint returned an unexpected response',
  network_error: 'the website could not be reached'
};

function errorLabel(error: string | null): string {
  if (!error) return '';
  return ERROR_LABELS[error] ?? `the configuration endpoint responded with an error (${error})`;
}

export function WebsiteReachability({
  reachability,
  bare = false
}: {
  reachability: Reachability;
  bare?: boolean;
}) {
  const checkedAt = new Date(reachability.configEndpointCheckedAt);
  return (
    <section className={bare ? 'status-block' : 'detail-card'}>
      {bare ? (
        <h3 className="sub-heading">Website reachability</h3>
      ) : (
        <>
          <p className="eyebrow">Live check</p>
          <h2 className="icon-heading">Website reachability</h2>
        </>
      )}
      <p role="status">
        <span
          className={`health-dot ${reachability.configEndpointReachable ? 'healthy' : 'attention'}`}
          aria-hidden="true"
        />
        {reachability.configEndpointReachable
          ? 'Website reachable'
          : `Website unreachable or misconfigured${
              reachability.configEndpointError
                ? ` — ${errorLabel(reachability.configEndpointError)}`
                : ''
            }`}
        {' as of '}
        <time dateTime={reachability.configEndpointCheckedAt}>{checkedAt.toLocaleString()}</time>
        {'.'}
      </p>
    </section>
  );
}
