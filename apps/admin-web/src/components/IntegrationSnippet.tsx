import { useState } from 'react';
import type {
  CloudflareGuidance,
  DynamicInstallation,
  Integration,
  StaticInstallation
} from '../api/local-operations.js';
import { CopyIcon } from './Icons.js';

type Mode = 'static' | 'dynamic';

function repoVariablesList(guidance: CloudflareGuidance): string {
  return Object.entries(guidance.repoVariables)
    .map(([name, value]) => `${name}=${value}`)
    .join('\n');
}

export function IntegrationSnippet({ snippet }: { snippet: Integration }) {
  const [mode, setMode] = useState<Mode>('static');
  const [copied, setCopied] = useState('');
  const [switched, setSwitched] = useState(false);
  const staticMode = snippet.modes?.find((item) => item.id === 'static') as
    StaticInstallation | undefined;
  const dynamicMode = snippet.modes?.find((item) => item.id === 'dynamic') as
    DynamicInstallation | undefined;
  const staticCode =
    staticMode?.snippet ??
    snippet.html ??
    'Snippet unavailable. Restart the local API with the current Vizoalica version.';

  async function copy(label: string, value: string) {
    await navigator.clipboard.writeText(value);
    setCopied(label);
  }

  function choose(next: Mode) {
    if (next !== mode) setSwitched(true);
    setCopied('');
    setMode(next);
  }

  return (
    <section className="detail-card integration-card">
      <div className="card-heading">
        <div>
          <p className="eyebrow">Installation</p>
          <h2>Connect this website</h2>
        </div>
      </div>
      <dl>
        <dt>Project ID</dt>
        <dd>{snippet.projectId ?? 'Unavailable'}</dd>
        <dt>Source ID (for the token issuer)</dt>
        <dd>{snippet.sourceId ?? 'Unavailable'}</dd>
        <dt>Public source key (for the browser)</dt>
        <dd>{snippet.publicSourceKey}</dd>
      </dl>

      <fieldset className="installation-options">
        <legend>Installation option</legend>
        <label>
          <input
            type="radio"
            name="installation-mode"
            checked={mode === 'static'}
            onChange={() => choose('static')}
          />
          <span>
            <strong>Static snippet</strong>
            <small>Website-specific values stay directly in the script tag.</small>
          </span>
        </label>
        <label>
          <input
            type="radio"
            name="installation-mode"
            checked={mode === 'dynamic'}
            disabled={!dynamicMode}
            onChange={() => choose('dynamic')}
          />
          <span>
            <strong>Dynamic configuration</strong>
            <small>One generic loader reads public values from your hosting environment.</small>
          </span>
        </label>
      </fieldset>

      {switched && (
        <p className="notice" role="status">
          Remove or disable the other installation path before switching so analytics initializes
          only once.
        </p>
      )}

      {mode === 'static' ? (
        <div className="installation-mode-panel">
          <div className="card-heading">
            <h3>Static snippet</h3>
            <button
              className="secondary"
              disabled={!staticMode && !snippet.html}
              onClick={() => void copy('static', staticCode)}
            >
              <CopyIcon size={16} />
              Copy static snippet
            </button>
          </div>
          <pre tabIndex={0} role="region" aria-label="Static integration code">
            <code>{staticCode}</code>
          </pre>
        </div>
      ) : dynamicMode ? (
        <div className="installation-mode-panel dynamic-installation">
          <div className="card-heading">
            <h3>Dynamic configuration</h3>
            <button className="secondary" onClick={() => void copy('dynamic', dynamicMode.snippet)}>
              <CopyIcon size={16} />
              Copy dynamic snippet
            </button>
          </div>
          <pre tabIndex={0} role="region" aria-label="Dynamic loader code">
            <code>{dynamicMode.snippet}</code>
          </pre>
          <p>
            The loader requests <code>{dynamicMode.configUrl}</code> from this website, deployed
            automatically by a GitHub Actions workflow whenever you push a change.
          </p>

          <div className="card-heading">
            <h3>1. Add this workflow to your website repository</h3>
            <button
              className="secondary"
              onClick={() => void copy('workflow', dynamicMode.cloudflare.starterWorkflowYaml)}
            >
              <CopyIcon size={16} />
              Copy workflow file
            </button>
          </div>
          <p>
            Save as <code>.github/workflows/deploy-website.yml</code>, replacing{' '}
            <code>YOUR_SITE_DIRECTORY</code> with your site&rsquo;s actual folder.
          </p>
          <pre tabIndex={0} role="region" aria-label="Starter GitHub Actions workflow">
            <code>{dynamicMode.cloudflare.starterWorkflowYaml}</code>
          </pre>

          <div className="card-heading">
            <h3>2. Add these repository variables</h3>
            <button
              className="secondary"
              onClick={() => void copy('variables', repoVariablesList(dynamicMode.cloudflare))}
            >
              <CopyIcon size={16} />
              Copy variable list
            </button>
          </div>
          <p>These are public browser configuration, not secrets.</p>
          <pre tabIndex={0} role="region" aria-label="Required GitHub repository variables">
            <code>{repoVariablesList(dynamicMode.cloudflare)}</code>
          </pre>
          <p>
            You must also set, using your own Cloudflare account details:{' '}
            {dynamicMode.cloudflare.accountSpecificVariables.join(', ')} (repository variables), and{' '}
            {dynamicMode.cloudflare.repoSecretNames.join(', ')} (repository secrets — generate these
            yourself, never paste a real value here).
          </p>

          <div className="card-heading">
            <h3>3. Or run this from your terminal</h3>
            <button
              className="secondary"
              onClick={() => void copy('commands', dynamicMode.cloudflare.setupCommands.join('\n'))}
            >
              <CopyIcon size={16} />
              Copy gh commands
            </button>
          </div>
          <pre tabIndex={0} role="region" aria-label="gh CLI setup commands">
            <code>{dynamicMode.cloudflare.setupCommands.join('\n')}</code>
          </pre>

          <ul className="integration-warnings">
            {dynamicMode.cloudflare.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
          <p>
            Other hosting providers can serve the same loader and version 1 JSON contract from a
            function, application route, environment-variable adapter, or generated public asset.
          </p>
        </div>
      ) : null}

      <p className="copy-status" role="status">
        {copied
          ? `${
              {
                static: 'Static snippet',
                dynamic: 'Dynamic snippet',
                workflow: 'Workflow file',
                variables: 'Variable list',
                commands: 'Setup commands'
              }[copied] ?? copied
            } copied to clipboard.`
          : 'Load the selected option only after the host consent manager grants analytics. Browser configuration is public; signing and deployment credentials stay server-side.'}
      </p>
    </section>
  );
}
