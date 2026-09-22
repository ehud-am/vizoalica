import { useId, useRef, useEffect, useState } from 'react';
import { setRoleHint, type RoleHint, type SetupState } from '../api/local-operations.js';
import { ConnectForm } from './ConnectForm.js';
import { ROLE_CHOICES, roleLabel } from './roles.js';

type Step = 'role' | 'backend' | 'deploy' | 'connect';

/**
 * The first thing a new console shows: at most three questions, then straight to the step that
 * matches the answers. Nothing here changes what the credential is allowed to do.
 */
export function FirstRun({ onDone }: { onDone: (state: SetupState) => void }) {
  const headingId = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  const [step, setStep] = useState<Step>('role');
  const [role, setRole] = useState<RoleHint>('admin');
  const [haveBackend, setHaveBackend] = useState<'need' | 'have'>('have');
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

  return (
    <section className="state-card first-run" aria-labelledby={headingId}>
      <p className="eyebrow">Welcome to Vizoalica</p>
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
            </div>
          </form>
        </>
      )}

      {step === 'backend' && (
        <>
          <h1 id={headingId} ref={heading} tabIndex={-1}>
            Do you have a backend?
          </h1>
          <p>
            The backend is the part that runs in your own Cloudflare account and stores your data.
          </p>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              setStep(haveBackend === 'need' ? 'deploy' : 'connect');
            }}
          >
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
              <button className="primary" type="submit">
                Continue
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
          <p>
            Deploying from this console is coming in the next release. Until then, set up the
            backend from the project’s source, then come back and connect to it here.
          </p>
          <ol className="steps">
            <li>
              Follow{' '}
              <a href="https://vizoalica.dev/get-started" target="_blank" rel="noopener noreferrer">
                the getting started guide
              </a>{' '}
              (it takes about ten minutes).
            </li>
            <li>
              Keep the backend address and the administrator secret it prints. The secret is shown
              once.
            </li>
            <li>Return here and connect.</li>
          </ol>
          <div className="form-actions">
            <button className="primary" type="button" onClick={() => setStep('connect')}>
              I have deployed it. Connect
            </button>
            {back('backend')}
          </div>
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
