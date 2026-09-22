import { useState } from 'react';
import { shareWebsite, type AccessKeyRole, type SetupDetails } from '../api/local-operations.js';
import { ActionButton } from '../components/ActionButton.js';
import { CopyButton } from '../components/CopyButton.js';

function download(details: SetupDetails) {
  const blob = new Blob([JSON.stringify(details, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `vizoalica-setup-${details.sourceId}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

/** Admin only: hand a website owner or analyst everything they need to connect, minted fresh each time. */
export function SharePanel({ projectId, websiteId }: { projectId: string; websiteId: string }) {
  const [role, setRole] = useState<AccessKeyRole>('owner');
  const [details, setDetails] = useState<SetupDetails>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function share() {
    setBusy(true);
    setError('');
    try {
      setDetails(await shareWebsite(projectId, websiteId, role));
    } catch {
      setError('Setup details could not be created. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel" aria-labelledby="share-heading">
      <h2 id="share-heading">Share setup</h2>
      <p>
        Give a website owner or an analyst everything they need to connect, without your
        administrator secret. Signing this website's token endpoint is a separate step; the note
        below links to it.
      </p>
      <fieldset className="role-choices">
        <legend>Give them</legend>
        <label className="role-choice">
          <input type="radio" name="share-role" checked={role === 'owner'} onChange={() => setRole('owner')} />
          <span>
            <strong>Website owner access</strong> — can manage this website.
          </span>
        </label>
        <label className="role-choice">
          <input type="radio" name="share-role" checked={role === 'analyst'} onChange={() => setRole('analyst')} />
          <span>
            <strong>Analyst access</strong> — can only view it.
          </span>
        </label>
      </fieldset>
      <div className="form-actions">
        <ActionButton capability="share-website-setup" type="button" className="primary" disabled={busy} onClick={() => void share()}>
          {busy ? 'Creating…' : details ? 'Create a new one' : 'Create setup details'}
        </ActionButton>
      </div>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {details && (
        <div className="share-result">
          <p className="hint">
            This key works once shown; save it now. The admin still needs to place the signing
            secret on this website's token endpoint (see the Install page).
          </p>
          <pre className="technical-value share-json">{JSON.stringify(details, null, 2)}</pre>
          <div className="form-actions">
            <CopyButton text={JSON.stringify(details, null, 2)} what="setup details" />
            <button className="secondary" type="button" onClick={() => download(details)}>
              Download as a file
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
