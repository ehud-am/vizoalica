import { useId, useState, type ReactNode } from 'react';
import {
  listEnvironments,
  setEnvironmentCloudflare,
  type EnvironmentCloudflareCredential,
  type Issue
} from '../api/local-operations.js';
import { CloudflareCredentialForm } from '../setup/CloudflareCredentialForm.js';

// Until one of these is fixed there is nothing to re-check, so only the form is offered.
const NEEDS_CREDENTIAL_FIRST = new Set(['no_credential', 'onecli_settings_missing']);

/**
 * A recognized problem in plain words: what happened, the ordered steps to fix it, and how to carry on
 * once it is fixed. When the fix is the Cloudflare credential, it can be changed right here.
 */
export function IssuePanel({
  issue,
  environment,
  actionLabel,
  onAction,
  busy,
  children
}: {
  issue: Issue;
  /** The environment whose credential a fix changes; the active one when not given. */
  environment?: string | undefined;
  /** What continuing is called: "Check again", or "Resume from …". */
  actionLabel: string;
  onAction: () => void;
  busy: boolean;
  /** Extra actions beside the main one, such as cleaning up. */
  children?: ReactNode;
}) {
  const headingId = useId();
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | undefined>();
  const credentialFirst = NEEDS_CREDENTIAL_FIRST.has(issue.code);

  async function save(credential: EnvironmentCloudflareCredential) {
    setSaving(true);
    setSaveError(undefined);
    try {
      const name = environment ?? (await listEnvironments()).active;
      if (!name) throw new Error('no_environment');
      await setEnvironmentCloudflare(name, credential);
      onAction();
    } catch {
      setSaveError('That credential could not be saved. Try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="panel issue-panel" role="alert" aria-labelledby={headingId}>
      <h3 id={headingId}>{issue.title}</h3>
      <p>{issue.detail}</p>
      <p>
        <strong>What to do</strong>
      </p>
      <ol>
        {issue.steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      {!credentialFirst && (
        <div className="form-actions">
          <button type="button" className="primary" disabled={busy} onClick={onAction}>
            {busy ? 'Checking…' : actionLabel}
          </button>
          {children}
        </div>
      )}
      {issue.fix === 'credential' && (
        <>
          <h4>
            {credentialFirst
              ? 'Set it up here'
              : 'Or change how this environment reaches Cloudflare'}
          </h4>
          <CloudflareCredentialForm
            submitLabel="Save and continue"
            busyLabel="Saving…"
            busy={saving || busy}
            error={saveError}
            onSubmit={(credential) => void save(credential)}
          >
            {credentialFirst ? children : undefined}
          </CloudflareCredentialForm>
        </>
      )}
    </section>
  );
}
