import { useState } from 'react';
import type { Integration } from '../api/local-operations.js';
import { CopyIcon } from './Icons.js';
export function IntegrationSnippet({ snippet }: { snippet: Integration }) {
  const [copied, setCopied] = useState(false);
  const code =
    snippet.html ??
    'Snippet unavailable. Restart the local API with the current Vizoalica version.';
  async function copy() {
    await navigator.clipboard.writeText(code);
    setCopied(true);
  }
  return (
    <section className="detail-card">
      <div className="card-heading">
        <div>
          <p className="eyebrow">Installation</p>
          <h2>Integration snippet</h2>
        </div>
        <button className="secondary" disabled={!snippet.html} onClick={() => void copy()}>
          <CopyIcon size={16} />
          Copy snippet
        </button>
      </div>
      <dl>
        <dt>Project ID</dt>
        <dd>{snippet.projectId ?? 'Unavailable'}</dd>
        <dt>Source ID (for the token issuer)</dt>
        <dd>{snippet.sourceId ?? 'Unavailable'}</dd>
        <dt>Public source key (for the browser)</dt>
        <dd>{snippet.publicSourceKey}</dd>
      </dl>
      <pre tabIndex={0} role="region" aria-label="Integration code">
        <code>{code}</code>
      </pre>
      <p className="copy-status" role="status">
        {copied
          ? 'Copied to clipboard.'
          : 'The public source key is safe to embed. Host the SDK and token endpoint on your site. Load this snippet only after consent; set data-consent to analytics-granted when granted.'}
      </p>
    </section>
  );
}
