import { useId, useRef, useEffect, useState, type ReactNode } from 'react';
import {
  ApiError,
  createEnvironment,
  getSetupState,
  importLegacySetup,
  setRoleHint,
  type RoleHint,
  type SetupState
} from '../api/local-operations.js';
import { assertEnvironmentNameLooksValid } from './environment-name.js';
import { ConnectForm } from './ConnectForm.js';
import { DeployWizard } from '../manage/DeployWizard.js';
import { ROLE_CHOICES, roleLabel } from './roles.js';

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

const ROLE_ICONS: Record<RoleHint, ReactNode> = {
  admin: (
    <svg {...iconProps}>
      <path d="M12 3l8 3v6c0 4.5-3.2 7.8-8 9-4.8-1.2-8-4.5-8-9V6z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  ),
  'website-owner': (
    <svg {...iconProps}>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.5 2.5 3.5 5.5 3.5 9S14.5 18.5 12 21c-2.5-2.5-3.5-5.5-3.5-9S9.5 5.5 12 3z" />
    </svg>
  ),
  analyst: (
    <svg {...iconProps}>
      <path d="M4 20V11M10 20V5M16 20v-7M22 20H2" />
    </svg>
  )
};

type Step = 'legacy' | 'role' | 'backend' | 'deploy' | 'connect';

/**
 * The first thing a new console shows: at most three questions, then straight to the step that
 * matches the answers. Nothing here changes what the credential is allowed to do.
 */
export function FirstRun({
  legacySetup,
  onDone
}: {
  legacySetup?: { workerHost: string; mode: 'file' | 'onecli' } | undefined;
  onDone: (state: SetupState) => void;
}) {
  const headingId = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  const [step, setStep] = useState<Step>(legacySetup ? 'legacy' : 'role');
  const [role, setRole] = useState<RoleHint>('admin');
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  useEffect(() => heading.current?.focus(), [step]);

  const back = (to: Step) => (
    <button className="secondary" type="button" onClick={() => setStep(to)}>
      Back
    </button>
  );

  function chooseRole(choice: RoleHint) {
    setRole(choice);
    // Remembering the choice is a convenience; a failure must not hold up the next step.
    void setRoleHint(choice).catch(() => undefined);
    setStep(choice === 'admin' ? 'backend' : 'connect');
  }

  async function importLegacy() {
    const problem = assertEnvironmentNameLooksValid(name);
    if (problem) {
      setNameError(problem);
      return;
    }
    setBusy(true);
    setNameError(undefined);
    try {
      onDone(await importLegacySetup(name));
    } catch (error) {
      setNameError(
        error instanceof ApiError && error.code === 'environment_name_taken'
          ? `An environment named "${name}" already exists.`
          : 'Could not import that setup. Try again.'
      );
    } finally {
      setBusy(false);
    }
  }

  async function nameEnvironment(haveBackend: 'need' | 'have') {
    const problem = assertEnvironmentNameLooksValid(name);
    if (problem) {
      setNameError(problem);
      return;
    }
    setBusy(true);
    setNameError(undefined);
    try {
      await createEnvironment(name);
      setStep(haveBackend === 'need' ? 'deploy' : 'connect');
    } catch (error) {
      setNameError(
        error instanceof ApiError && error.code === 'environment_name_taken'
          ? `An environment named "${name}" already exists.`
          : error instanceof ApiError && error.code === 'environments_not_supported'
            ? 'This console is running against a single fixed backend, so it cannot create environments. Start it with `vizoalica console` instead.'
            : 'Could not create that environment. Try again.'
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="state-card first-run" aria-labelledby={headingId}>
      {step !== 'role' && <p className="eyebrow">Welcome to Vizoalica</p>}
      {step === 'legacy' && legacySetup && (
        <>
          <h1 id={headingId} ref={heading} tabIndex={-1}>
            We found an existing setup
          </h1>
          <p>
            A backend at <strong>{legacySetup.workerHost}</strong> is already configured on this
            computer{legacySetup.mode === 'onecli' ? ' through OneCLI' : ''}. Name it to bring it in
            as your first environment — the name is used only to keep its resources apart from any
            others you create later.
          </p>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void importLegacy();
            }}
          >
            <label htmlFor="legacy-name">Environment name</label>
            <input
              id="legacy-name"
              value={name}
              autoComplete="off"
              placeholder="prod"
              aria-describedby={nameError ? 'legacy-name-error' : undefined}
              onChange={(event) => {
                setName(event.target.value);
                setNameError(undefined);
              }}
            />
            {nameError && (
              <p id="legacy-name-error" className="notice error" role="alert">
                {nameError}
              </p>
            )}
            <div className="form-actions">
              <button className="primary" type="submit" disabled={busy}>
                {busy ? 'Importing…' : 'Import'}
              </button>
              <button
                className="secondary"
                type="button"
                onClick={() => setStep('role')}
                disabled={busy}
              >
                Set up something else instead
              </button>
            </div>
          </form>
        </>
      )}

      {step === 'role' && (
        <>
          <div className="welcome-mark" aria-hidden="true">
            <svg {...iconProps} width={28} height={28} strokeWidth={2}>
              <path d="M4 20V11M10 20V5M16 20v-7M22 20H2" />
            </svg>
          </div>
          <p className="eyebrow">First-time setup</p>
          <h1 id={headingId} ref={heading} tabIndex={-1}>
            Welcome to Vizoalica
          </h1>
          <p className="welcome-lead">
            Since this is your first run, we need to set up a few things. First: what role will this
            machine play?
          </p>
          <div className="choice-grid" role="group" aria-label="What role will this machine play?">
            {ROLE_CHOICES.map((choice) => (
              <button
                key={choice.hint}
                type="button"
                className="choice-card"
                onClick={() => chooseRole(choice.hint)}
              >
                <span className="choice-icon" aria-hidden="true">
                  {ROLE_ICONS[choice.hint]}
                </span>
                <span className="choice-title">{choice.label}</span>
                <span className="choice-text">{choice.tagline}</span>
              </button>
            ))}
          </div>
          {legacySetup && <div className="form-actions">{back('legacy')}</div>}
        </>
      )}

      {step === 'backend' && (
        <>
          <p className="eyebrow">Step 2 of 3</p>
          <h1 id={headingId} ref={heading} tabIndex={-1}>
            Name your environment
          </h1>
          <p className="welcome-lead">
            One environment is one backend, with its own data. Most people only need one.
          </p>
          <label className="name-field" htmlFor="environment-name">
            Environment name
          </label>
          <input
            id="environment-name"
            className="name-input"
            value={name}
            autoComplete="off"
            placeholder="prod"
            aria-describedby={nameError ? 'environment-name-error' : undefined}
            onChange={(event) => {
              setName(event.target.value);
              setNameError(undefined);
            }}
          />
          {nameError && (
            <p id="environment-name-error" className="notice error" role="alert">
              {nameError}
            </p>
          )}
          <div
            className="choice-grid two"
            role="group"
            aria-label="Do you have a backend?"
            aria-busy={busy}
          >
            <button
              type="button"
              className="choice-card"
              disabled={busy}
              onClick={() => void nameEnvironment('have')}
            >
              <span className="choice-icon" aria-hidden="true">
                <svg {...iconProps}>
                  <path d="M10 14a4 4 0 0 0 5.700 0l3-3a4 4 0 0 0-5.700-5.700l-1 1M14 10a4 4 0 0 0-5.700 0l-3 3a4 4 0 0 0 5.700 5.700l1-1" />
                </svg>
              </span>
              <span className="choice-title">I already have one</span>
              <span className="choice-text">Connect with its address</span>
            </button>
            <button
              type="button"
              className="choice-card"
              disabled={busy}
              onClick={() => void nameEnvironment('need')}
            >
              <span className="choice-icon" aria-hidden="true">
                <svg {...iconProps}>
                  <path d="M7 18a5 5 0 1 1 1-9.900A6 6 0 0 1 19.500 11 3.500 3.500 0 0 1 18 18z" />
                </svg>
              </span>
              <span className="choice-title">I need a backend</span>
              <span className="choice-text">Set one up in Cloudflare</span>
            </button>
          </div>
          <div className="form-actions">{back('role')}</div>
        </>
      )}

      {step === 'deploy' && (
        <>
          <h1 id={headingId} ref={heading} tabIndex={-1}>
            Set up a backend
          </h1>
          <DeployWizard
            onDeployed={() => {
              void getSetupState().then(onDone);
            }}
          />
          <div className="form-actions">{back('backend')}</div>
        </>
      )}

      {step === 'connect' && (
        <>
          <h1 id={headingId} ref={heading} tabIndex={-1}>
            {role === 'admin'
              ? 'Connect your backend'
              : `Connect as ${roleLabel(role).toLowerCase()}`}
          </h1>
          <p>
            {role === 'admin'
              ? 'Enter the backend address and the administrator secret.'
              : role === 'website-owner'
                ? 'Paste the setup details your admin gave you, or upload the file.'
                : 'Enter the backend address and the access key your admin gave you.'}
          </p>
          <ConnectForm
            role={role}
            onConnected={onDone}
            cancel={back(role === 'admin' ? 'backend' : 'role')}
          />
        </>
      )}
    </section>
  );
}
