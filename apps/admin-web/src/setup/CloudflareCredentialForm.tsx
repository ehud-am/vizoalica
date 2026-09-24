import { useEffect, useState, type ReactNode } from 'react';
import { listEnvironments, type EnvironmentCloudflareCredential } from '../api/local-operations.js';

const iconProps = {
  viewBox: '0 0 24 24',
  width: 22,
  height: 22,
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round'
} as const;

/**
 * How the console reaches Cloudflare for one environment: an API token, or OneCLI (asking for its
 * project, agent, and gateway only when this computer has none saved yet). Used when an environment is
 * first set up and again to fix its credential in place during a deploy.
 */
export function CloudflareCredentialForm({
  submitLabel,
  busyLabel,
  busy,
  error,
  onSubmit,
  children
}: {
  submitLabel: string;
  busyLabel: string;
  busy: boolean;
  /** A failure from saving, shown with the form's own validation messages. */
  error?: string | undefined;
  onSubmit: (credential: EnvironmentCloudflareCredential) => void;
  /** Extra actions, such as Back, shown beside the submit button. */
  children?: ReactNode;
}) {
  const [mode, setMode] = useState<'token' | 'onecli'>('token');
  const [token, setToken] = useState('');
  const [problem, setProblem] = useState<string | undefined>();
  const [onecliConfigured, setOnecliConfigured] = useState(false);
  const [fields, setFields] = useState({ project: '', agent: '', gateway: '127.0.0.1:10255' });

  useEffect(() => {
    listEnvironments()
      .then((list) => setOnecliConfigured(list.onecliConfigured === true))
      .catch(() => setOnecliConfigured(false));
  }, []);

  function submit() {
    if (mode === 'token') {
      if (!token.trim()) {
        setProblem('Paste a Cloudflare API token, or choose OneCLI.');
        return;
      }
      setProblem(undefined);
      onSubmit({ mode: 'token', token: token.trim() });
      return;
    }
    if (onecliConfigured) {
      setProblem(undefined);
      onSubmit({ mode: 'onecli' });
      return;
    }
    const trimmed = {
      project: fields.project.trim(),
      agent: fields.agent.trim(),
      gateway: fields.gateway.trim()
    };
    if (Object.values(trimmed).some((value) => !value || /\s/.test(value))) {
      setProblem('Fill in the OneCLI project, agent, and gateway (no spaces).');
      return;
    }
    setProblem(undefined);
    onSubmit({ mode: 'onecli', onecli: trimmed });
  }

  const shown = problem ?? error;
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <div
        className="choice-grid two"
        role="group"
        aria-label="How should the console reach Cloudflare?"
      >
        <button
          type="button"
          className="choice-card"
          aria-pressed={mode === 'token'}
          onClick={() => setMode('token')}
        >
          <span className="choice-icon" aria-hidden="true">
            <svg {...iconProps}>
              <circle cx="8" cy="15" r="4" />
              <path d="M11 12l9-9M16 7l3 3M14 9l2 2" />
            </svg>
          </span>
          <span className="choice-title">A Cloudflare API token</span>
          <span className="choice-text">Paste a token; it is saved on this computer</span>
        </button>
        <button
          type="button"
          className="choice-card"
          aria-pressed={mode === 'onecli'}
          onClick={() => setMode('onecli')}
        >
          <span className="choice-icon" aria-hidden="true">
            <svg {...iconProps}>
              <path d="M4 5h16v14H4zM8 10l3 2-3 2M13 15h3" />
            </svg>
          </span>
          <span className="choice-title">OneCLI</span>
          <span className="choice-text">Already set up on this computer</span>
        </button>
      </div>
      {mode === 'token' && (
        <>
          <label className="name-field" htmlFor="cloudflare-token">
            API token
          </label>
          <input
            id="cloudflare-token"
            className="name-input"
            type="password"
            value={token}
            autoComplete="off"
            aria-describedby={shown ? 'credential-error' : undefined}
            onChange={(event) => {
              setToken(event.target.value);
              setProblem(undefined);
            }}
          />
        </>
      )}
      {mode === 'onecli' &&
        (onecliConfigured ? (
          <p className="welcome-lead">OneCLI settings were found on this computer.</p>
        ) : (
          (['project', 'agent', 'gateway'] as const).map((field) => (
            <div key={field}>
              <label className="name-field" htmlFor={`onecli-${field}`}>
                {`OneCLI ${field}`}
              </label>
              <input
                id={`onecli-${field}`}
                className="name-input"
                value={fields[field]}
                autoComplete="off"
                onChange={(event) => {
                  setFields({ ...fields, [field]: event.target.value });
                  setProblem(undefined);
                }}
              />
            </div>
          ))
        ))}
      {shown && (
        <p id="credential-error" className="notice error" role="alert">
          {shown}
        </p>
      )}
      <div className="form-actions">
        <button className="primary" type="submit" disabled={busy}>
          {busy ? busyLabel : submitLabel}
        </button>
        {children}
      </div>
    </form>
  );
}
