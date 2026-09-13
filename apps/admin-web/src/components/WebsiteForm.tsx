import { useId, useState, type FormEvent } from 'react';
import type { Project } from '../api/local-operations.js';
import { PlusIcon } from './Icons.js';
export function WebsiteForm({
  onSubmit,
  projects,
  initialName = '',
  initialOrigins = [''],
  submitLabel = 'Add website'
}: {
  onSubmit: (input: {
    projectId?: string;
    name: string;
    allowedOrigins: string[];
  }) => Promise<void>;
  projects?: Project[];
  initialName?: string;
  initialOrigins?: string[];
  submitLabel?: string;
}) {
  const [name, setName] = useState(initialName);
  const [origins, setOrigins] = useState(initialOrigins.join('\n'));
  const [projectId, setProjectId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const id = useId();
  const originsHelpId = `${id}-origins-help`;
  const errorId = `${id}-error`;
  const creating = projects !== undefined;
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await onSubmit({
        ...(creating ? { projectId } : {}),
        name: name.trim(),
        allowedOrigins: origins.split(/\s+/).filter(Boolean)
      });
      if (creating) {
        setProjectId('');
        setName('');
        setOrigins('');
      }
    } catch {
      setError('Website could not be saved. Your entries are unchanged; review and try again.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      className="website-form"
      aria-label={creating ? 'Add website' : 'Edit website'}
      onSubmit={(event) => void submit(event)}
    >
      {creating && (
        <label>
          Project
          <select
            required
            value={projectId}
            disabled={busy}
            aria-describedby={error ? errorId : undefined}
            onChange={(event) => setProjectId(event.target.value)}
          >
            <option value="" disabled>
              Select a project
            </option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name} ({project.id})
              </option>
            ))}
          </select>
        </label>
      )}
      <label>
        Website name
        <input
          required
          maxLength={120}
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Marketing site"
        />
      </label>
      <label>
        Allowed origins
        <textarea
          required
          rows={2}
          value={origins}
          onChange={(event) => setOrigins(event.target.value)}
          placeholder="https://example.com"
          aria-describedby={`${originsHelpId}${error ? ` ${errorId}` : ''}`}
        />
      </label>
      <small id={originsHelpId}>One exact http or https origin per line.</small>
      {error && (
        <p id={errorId} className="notice error" role="alert">
          {error}
        </p>
      )}
      <button className="primary" disabled={busy || (creating && !projectId)}>
        {!busy && submitLabel === 'Add website' && <PlusIcon size={16} />}
        {busy ? 'Saving…' : submitLabel}
      </button>
    </form>
  );
}
