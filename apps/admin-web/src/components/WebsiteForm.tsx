import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { ActionButton } from './ActionButton.js';
import { PlusIcon } from './Icons.js';
import { isInsecureRemote, nameFromOrigin, normalizeOrigin, wwwCounterpart } from './origins.js';

export interface WebsiteInput {
  name: string;
  allowedOrigins: string[];
}

const MAX_NAME = 120;
/** The service accepts at most this many origins for one website. */
const MAX_ORIGINS = 10;

/** Addresses are separated by whitespace or commas, so a pasted list works as it is. */
const splitAddresses = (text: string) => text.split(/[\s,]+/).filter(Boolean);

interface Errors {
  name?: string;
  origins?: string;
}

interface Resolved {
  origins: string[];
  /** The first entry that could not be turned into an origin, with what to type instead. */
  problem?: string;
}

/** Every entry as the exact origin it would be saved as, in order, without repeats. */
function resolveOrigins(text: string, alsoWww: string | undefined): Resolved {
  const origins: string[] = [];
  for (const entry of splitAddresses(text)) {
    const result = normalizeOrigin(entry);
    if (!result.origin) return { origins, problem: result.error ?? 'Enter a valid address.' };
    if (!origins.includes(result.origin)) origins.push(result.origin);
  }
  if (alsoWww && !origins.includes(alsoWww)) origins.push(alsoWww);
  return { origins };
}

function validate(name: string, resolved: Resolved, creating: boolean): Errors {
  const errors: Errors = {};
  // A new website may leave the name empty (it takes its domain); an existing one may not lose it.
  if (!creating && !name.trim()) errors.name = 'Enter a name for this website.';
  else if (name.trim().length > MAX_NAME) errors.name = `Use ${MAX_NAME} characters or fewer.`;
  if (resolved.problem) errors.origins = resolved.problem;
  else if (resolved.origins.length === 0) errors.origins = 'Enter your website’s address.';
  else if (resolved.origins.length > MAX_ORIGINS)
    errors.origins = `Use ${MAX_ORIGINS} addresses or fewer.`;
  return errors;
}

/**
 * The website form. To add a website it takes an address (pasted as people copy it) and shows the
 * exact origin it will be saved as; the project is the one already chosen at the top, shown here
 * and never asked. To edit, it takes the name and the allowed origins. It reports whether it has
 * unsaved changes so its page can protect them.
 */
export function WebsiteForm({
  onSubmit,
  projectName,
  initialName = '',
  initialOrigins = [''],
  submitLabel = 'Add website',
  onDirtyChange,
  cancel,
  autoFocus = false
}: {
  onSubmit: (input: WebsiteInput) => Promise<void>;
  /** When given the form adds a website to that project; without it, it edits one. */
  projectName?: string;
  initialName?: string;
  initialOrigins?: string[];
  submitLabel?: string;
  onDirtyChange?: (dirty: boolean) => void;
  /** A leave control (for example Cancel) shown next to the submit button. */
  cancel?: ReactNode;
  autoFocus?: boolean;
}) {
  const creating = projectName !== undefined;
  const [name, setName] = useState(initialName);
  const [origins, setOrigins] = useState(initialOrigins.join('\n'));
  const [includeWww, setIncludeWww] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const id = useId();
  const nameRef = useRef<HTMLInputElement>(null);
  const originsRef = useRef<HTMLTextAreaElement>(null);
  const originsHelpId = `${id}-origins-help`;
  const previewId = `${id}-preview`;
  const errorId = `${id}-error`;

  // The other spelling of the site (with or without www), offered when one address is entered.
  const counterpart = useMemo(() => {
    if (!creating) return undefined;
    const typed = resolveOrigins(origins, undefined);
    if (typed.problem || typed.origins.length !== 1) return undefined;
    return wwwCounterpart(typed.origins[0]!);
  }, [creating, origins]);
  const resolved = useMemo(
    () => resolveOrigins(origins, creating && includeWww ? counterpart : undefined),
    [origins, creating, includeWww, counterpart]
  );
  const defaultName = resolved.origins[0] ? nameFromOrigin(resolved.origins[0]) : '';

  const dirty = creating
    ? name !== '' || origins.trim() !== ''
    : name !== initialName ||
      resolved.origins.join('\n') !==
        resolveOrigins(initialOrigins.join('\n'), undefined).origins.join('\n');

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);
  useEffect(() => {
    if (autoFocus) (creating ? originsRef : nameRef).current?.focus();
  }, [autoFocus, creating]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const found = validate(name, resolved, creating);
    setErrors(found);
    setError('');
    if (found.name) return nameRef.current?.focus();
    if (found.origins) return originsRef.current?.focus();
    setBusy(true);
    try {
      await onSubmit({
        // An empty name is the domain, so nobody has to invent one to get started.
        name: name.trim() || defaultName,
        allowedOrigins: resolved.origins
      });
      if (creating) {
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

  const nameField = (
    <div className="field" key="name">
      <label htmlFor={`${id}-name`}>
        Website name
        {creating && <span className="optional"> (optional)</span>}
      </label>
      <input
        id={`${id}-name`}
        ref={nameRef}
        maxLength={MAX_NAME + 20}
        value={name}
        aria-invalid={!!errors.name}
        aria-describedby={describedBy('name')}
        onChange={(event) => setName(event.target.value)}
        placeholder={creating ? defaultName || 'Named after its domain' : 'Marketing site'}
      />
      {errors.name && (
        <span id={`${id}-name-error`} className="field-error">
          {errors.name}
        </span>
      )}
    </div>
  );

  // Show what will be saved when it differs from what was typed, so nothing changes by surprise.
  const changed = splitAddresses(origins).length > 0 && !resolved.problem;
  const insecure = resolved.origins.filter(isInsecureRemote);
  const originsField = (
    <div className="field" key="origins">
      <label htmlFor={`${id}-origins`}>{creating ? 'Website address' : 'Allowed origins'}</label>
      <textarea
        id={`${id}-origins`}
        ref={originsRef}
        required
        rows={creating ? 2 : 3}
        value={origins}
        onChange={(event) => setOrigins(event.target.value)}
        placeholder="example.com"
        aria-invalid={!!errors.origins}
        aria-describedby={describedBy(
          'origins',
          `${originsHelpId}${changed ? ` ${previewId}` : ''}${error ? ` ${errorId}` : ''}`
        )}
      />
      {errors.origins && (
        <span id={`${id}-origins-error`} className="field-error">
          {errors.origins}
        </span>
      )}
      <small id={originsHelpId}>
        {creating
          ? 'Paste the address people open, like example.com. Anything after the domain is dropped.'
          : 'One address per line. List every hostname that serves the site, such as the bare domain and www.'}
      </small>
      {changed && (
        <p id={previewId} className="origin-preview" aria-live="polite">
          <span>Will be saved as:</span>{' '}
          {resolved.origins.map((origin, index) => (
            <span key={origin}>
              {index > 0 && ', '}
              <code>{origin}</code>
            </span>
          ))}
        </p>
      )}
      {insecure.length > 0 && (
        <p className="hint">
          {insecure.join(', ')} uses http. Signed tokens need https, so use it only for testing.
        </p>
      )}
    </div>
  );

  return (
    <form
      className="website-form"
      aria-label={creating ? 'Add website' : 'Edit website'}
      noValidate
      onSubmit={(event) => void submit(event)}
    >
      {creating && (
        <p className="form-project">
          Project: <strong>{projectName}</strong>
        </p>
      )}
      {creating ? [originsField, nameField] : [nameField, originsField]}
      {creating && counterpart && (
        <label className="checkbox-field">
          <input
            type="checkbox"
            checked={includeWww}
            onChange={(event) => setIncludeWww(event.target.checked)}
          />
          <span>
            Also allow <code>{counterpart}</code>
          </span>
        </label>
      )}
      {error && (
        <p id={errorId} className="notice error" role="alert">
          {error}
        </p>
      )}
      <div className="form-actions">
        <ActionButton
          capability={creating ? 'add-website' : 'edit-website'}
          context={{ hasProject: true }}
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
