import { useState } from 'react';
import type { Integration } from '../api/local-operations.js';
export function IntegrationSnippet({ snippet }: { snippet: Integration }) {
  const [copied, setCopied] = useState(false);
  const code =
    snippet.html ??
    `<script async src="https://analytics.example.com/vizoalica.js" data-source="${snippet.publicSourceKey}" data-token-url="/vizoalica/ingest-token"></script>`;
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
        <button className="secondary" onClick={() => void copy()}>
          Copy snippet
        </button>
      </div>
      <pre tabIndex={0}>
        <code>{code}</code>
      </pre>
      <p className="copy-status" role="status">
        {copied
          ? 'Copied to clipboard.'
          : 'The public source key is safe to embed. Your site must issue short-lived tokens.'}
      </p>
    </section>
  );
}
