import { useMemo, useState } from 'react';
import type {
  CloudflareGuidance,
  DynamicInstallation,
  Integration,
  StaticInstallation
} from '../api/local-operations.js';
import { CopyIcon } from './Icons.js';

type Mode = 'static' | 'dynamic';

function publicVariables(guidance: CloudflareGuidance): string {
  return `[vars]\n${Object.entries(guidance.publicVariables)
    .map(([name, value]) => `${name} = ${JSON.stringify(value)}`)
    .join('\n')}`;
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}

function configuredCommand(
  command: string,
  initial: CloudflareGuidance['targetInputs'],
  current: CloudflareGuidance['targetInputs']
): string {
  return (Object.keys(initial) as Array<keyof typeof initial>).reduce(
    (result, key) => result.replaceAll(shellQuote(initial[key]), shellQuote(current[key])),
    command
  );
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
  const [targets, setTargets] = useState(
    dynamicMode?.cloudflare.targetInputs ?? {
      pagesProject: '',
      environment: '',
      productionBranch: '',
      siteDirectory: '',
      outputDirectory: ''
    }
  );
  const commands = useMemo(
    () =>
      dynamicMode?.cloudflare.steps.flatMap((step) =>
        step.commands.map((command) =>
          configuredCommand(command, dynamicMode.cloudflare.targetInputs, targets)
        )
      ) ?? [],
    [dynamicMode, targets]
  );
  const targetsReady = Object.values(targets).every(
    (value) => value.trim() && !value.includes('YOUR_') && !value.includes('REPLACE_')
  );

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
            The loader requests <code>{dynamicMode.configUrl}</code> from this website. All values
            below are public browser configuration—not secrets.
          </p>
          <pre tabIndex={0} role="region" aria-label="Dynamic public configuration">
            <code>{JSON.stringify(dynamicMode.config, null, 2)}</code>
          </pre>
          <div className="card-heading">
            <h3>Cloudflare public variables</h3>
            <button
              className="secondary"
              onClick={() => void copy('variables', publicVariables(dynamicMode.cloudflare))}
            >
              <CopyIcon size={16} />
              Copy public variables
            </button>
          </div>
          <pre tabIndex={0} role="region" aria-label="Cloudflare public variable block">
            <code>{publicVariables(dynamicMode.cloudflare)}</code>
          </pre>

          <fieldset className="cloudflare-targets">
            <legend>Confirm the Cloudflare target</legend>
            {(Object.keys(targets) as Array<keyof typeof targets>).map((key) => (
              <label key={key}>
                {key.replace(/([A-Z])/g, ' $1')}
                <input
                  required
                  value={targets[key]}
                  onChange={(event) => setTargets({ ...targets, [key]: event.target.value })}
                />
              </label>
            ))}
          </fieldset>

          <ol className="cloudflare-steps">
            {dynamicMode.cloudflare.steps.map((step) => (
              <li key={step.id}>
                <strong>{step.title}</strong>
                {step.commands.map((command) => (
                  <pre
                    key={command}
                    tabIndex={0}
                    role="region"
                    aria-label={`${step.title} command`}
                  >
                    <code>
                      {configuredCommand(command, dynamicMode.cloudflare.targetInputs, targets)}
                    </code>
                  </pre>
                ))}
              </li>
            ))}
          </ol>
          <button
            className="secondary"
            disabled={!targetsReady}
            onClick={() => void copy('commands', commands.join('\n'))}
          >
            <CopyIcon size={16} />
            Copy reviewed commands
          </button>
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
          ? `${copied === 'static' ? 'Static snippet' : copied === 'dynamic' ? 'Dynamic snippet' : copied === 'variables' ? 'Public variables' : 'Reviewed commands'} copied to clipboard.`
          : 'Load the selected option only after the host consent manager grants analytics. Browser configuration is public; signing and deployment credentials stay server-side.'}
      </p>
    </section>
  );
}
