import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import type { Project } from '../api/local-operations.js';
import { ActionButton } from './ActionButton.js';
import { PlusIcon } from './Icons.js';

export interface WebsiteInput {
  projectId?: string;
  name: string;
  allowedOrigins: string[];
}

const MAX_NAME = 120;

/** An exact http(s) origin: scheme and host (and port) only, no path, no trailing slash. */
export function isExactOrigin(value: string): boolean {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && url.origin === value;
  } catch {
    return false;
  }
}

const splitOrigins = (text: string) => text.split(/\s+/).filter(Boolean);

interface Errors {
  project?: string;
  name?: string;
  origins?: string;
}

function validate(
  name: string,
  origins: string[],
  projectRequired: boolean,
  projectId: string
): Errors {
  const errors: Errors = {};
  if (projectRequired && !projectId) errors.project = 'Choose the project this website belongs to.';
  if (!name.trim()) errors.name = 'Enter a name for this website.';
  else if (name.trim().length > MAX_NAME) errors.name = `Use ${MAX_NAME} characters or fewer.`;
  if (origins.length === 0) errors.origins = 'Enter at least one allowed origin.';
  else {
    const bad = origins.find((origin) => !isExactOrigin(origin));
    if (bad)
      errors.origins = `“${bad}” is not an exact origin. Use the scheme and host only, like https://example.com, with no path or trailing slash.`;
  }
  return errors;
}

/**
 * The website form, used to add (when `projects` is given, with the project as its first field) and
 * to edit. It reports whether it has unsaved changes so its page can protect them.
 */
export function WebsiteForm({
  onSubmit,
  projects,
  initialName = '',
  initialOrigins = [''],
  submitLabel = 'Add website',
  onDirtyChange,
  cancel,
  autoFocus = false
}: {
  onSubmit: (input: WebsiteInput) => Promise<void>;
  projects?: Project[];
  initialName?: string;
  initialOrigins?: string[];
  submitLabel?: string;
  onDirtyChange?: (dirty: boolean) => void;
  /** A leave control (for example Cancel) shown next to the submit button. */
  cancel?: ReactNode;
  autoFocus?: boolean;
}) {
  const [name, setName] = useState(initialName);
  const [origins, setOrigins] = useState(initialOrigins.join('\n'));
  const [projectId, setProjectId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const id = useId();
  const nameRef = useRef<HTMLInputElement>(null);
  const originsRef = useRef<HTMLTextAreaElement>(null);
  const projectRef = useRef<HTMLSelectElement>(null);
  const creating = projects !== undefined;
  const originsHelpId = `${id}-origins-help`;
  const errorId = `${id}-error`;

  const dirty = creating
    ? !!projectId || name !== '' || origins.trim() !== ''
    : name !== initialName ||
      splitOrigins(origins).join('\n') !== splitOrigins(initialOrigins.join('\n')).join('\n');

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);
  useEffect(() => {
    if (autoFocus) (creating ? projectRef : nameRef).current?.focus();
  }, [autoFocus, creating]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const list = splitOrigins(origins);
    const found = validate(name, list, creating, projectId);
    setErrors(found);
    setError('');
    if (found.project) return projectRef.current?.focus();
    if (found.name) return nameRef.current?.focus();
    if (found.origins) return originsRef.current?.focus();
    setBusy(true);
    try {
      await onSubmit({
        ...(creating ? { projectId } : {}),
        name: name.trim(),
        allowedOrigins: list
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

  const describedBy = (field: keyof Errors, extra?: string) =>
    [errors[field] ? `${id}-${field}-error` : '', extra ?? ''].filter(Boolean).join(' ') ||
    undefined;

  return (
    <form
      className="website-form"
      aria-label={creating ? 'Add website' : 'Edit website'}
      noValidate
      onSubmit={(event) => void submit(event)}
    >
      {creating && (
        <div className="field">
          <label htmlFor={`${id}-project`}>Project</label>
          <select
            id={`${id}-project`}
            ref={projectRef}
            required
            value={projectId}
            disabled={busy}
            aria-invalid={!!errors.project}
            aria-describedby={describedBy('project', error ? errorId : undefined)}
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
          {errors.project && (
            <span id={`${id}-project-error`} className="field-error">
              {errors.project}
            </span>
          )}
        </div>
      )}
      <div className="field">
        <label htmlFor={`${id}-name`}>Website name</label>
        <input
          id={`${id}-name`}
          ref={nameRef}
          required
          maxLength={MAX_NAME + 20}
          value={name}
          aria-invalid={!!errors.name}
          aria-describedby={describedBy('name')}
          onChange={(event) => setName(event.target.value)}
          placeholder="Marketing site"
        />
        {errors.name && (
          <span id={`${id}-name-error`} className="field-error">
            {errors.name}
          </span>
        )}
      </div>
      <div className="field">
        <label htmlFor={`${id}-origins`}>Allowed origins</label>
        <textarea
          id={`${id}-origins`}
          ref={originsRef}
          required
          rows={3}
          value={origins}
          onChange={(event) => setOrigins(event.target.value)}
          placeholder="https://example.com"
          aria-invalid={!!errors.origins}
          aria-describedby={describedBy('origins', `${originsHelpId}${error ? ` ${errorId}` : ''}`)}
        />
        {errors.origins && (
          <span id={`${id}-origins-error`} className="field-error">
            {errors.origins}
          </span>
        )}
      </div>
      <small id={originsHelpId}>
        One exact http or https origin per line, for example https://example.com. List every
        hostname that serves the site (such as the bare domain and www).
      </small>
      {error && (
        <p id={errorId} className="notice error" role="alert">
          {error}
        </p>
      )}
      <div className="form-actions">
        <ActionButton
          capability={creating ? 'add-website' : 'edit-website'}
          context={{ hasProject: !creating || projects.length > 0 }}
          type="submit"
          className="primary"
          disabled={busy || (creating ? false : !dirty)}
        >
          {!busy && creating && <PlusIcon size={16} />}
          {busy ? 'Saving…' : submitLabel}
        </ActionButton>
        {cancel}
      </div>
    </form>
  );
}
