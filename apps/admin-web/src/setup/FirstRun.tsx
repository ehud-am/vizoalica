import { useId, useRef, useEffect, useState } from 'react';
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
  const [haveBackend, setHaveBackend] = useState<'need' | 'have'>('have');
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  useEffect(() => heading.current?.focus(), [step]);

  const back = (to: Step) => (
    <button className="secondary" type="button" onClick={() => setStep(to)}>
      Back
    </button>
  );

  async function chooseRole() {
    // Remembering the choice is a convenience; a failure must not hold up the next step.
    void setRoleHint(role).catch(() => undefined);
    setStep(role === 'admin' ? 'backend' : 'connect');
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

  async function nameEnvironment() {
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
          : 'Could not create that environment. Try again.'
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="state-card first-run" aria-labelledby={headingId}>
      <p className="eyebrow">Welcome to Vizoalica</p>
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
          <h1 id={headingId} ref={heading} tabIndex={-1}>
            Who are you?
          </h1>
          <p>
            This only decides what to show you first. What you can do is set by your credential.
          </p>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void chooseRole();
            }}
          >
            <fieldset className="role-choices">
              <legend className="sr-only">Who are you?</legend>
              {ROLE_CHOICES.map((choice) => (
                <label key={choice.hint} className="role-choice">
                  <input
                    type="radio"
                    name="role"
                    value={choice.hint}
                    checked={role === choice.hint}
                    onChange={() => setRole(choice.hint)}
                  />
                  <span>
                    <strong>{choice.label}</strong> — {choice.blurb}
                    <small>
                      {choice.can} {choice.cannot}
                    </small>
                  </span>
                </label>
              ))}
            </fieldset>
            <div className="form-actions">
              <button className="primary" type="submit">
                Continue
              </button>
              {legacySetup && back('legacy')}
            </div>
          </form>
        </>
      )}

      {step === 'backend' && (
        <>
          <h1 id={headingId} ref={heading} tabIndex={-1}>
            Name your environment, and do you have a backend?
          </h1>
          <p>
            An environment is one independent backend — its own Worker, database, and data. Most
            people only ever need one; you can add more later. Its name is also used to keep its
            Cloudflare resources apart from any other environment&rsquo;s.
          </p>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void nameEnvironment();
            }}
          >
            <label htmlFor="environment-name">Environment name</label>
            <input
              id="environment-name"
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
            <fieldset className="role-choices">
              <legend className="sr-only">Do you have a backend?</legend>
              <label className="role-choice">
                <input
                  type="radio"
                  name="backend"
                  checked={haveBackend === 'have'}
                  onChange={() => setHaveBackend('have')}
                />
                <span>
                  <strong>I already have one</strong>
                  <small>Connect to it with its address and administrator secret.</small>
                </span>
              </label>
              <label className="role-choice">
                <input
                  type="radio"
                  name="backend"
                  checked={haveBackend === 'need'}
                  onChange={() => setHaveBackend('need')}
                />
                <span>
                  <strong>I need a backend</strong>
                  <small>Set one up in your Cloudflare account.</small>
                </span>
              </label>
            </fieldset>
            <div className="form-actions">
              <button className="primary" type="submit" disabled={busy}>
                {busy ? 'Working…' : 'Continue'}
              </button>
              {back('role')}
            </div>
          </form>
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
