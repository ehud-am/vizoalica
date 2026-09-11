import { useState, type FormEvent } from 'react';
import { PlusIcon } from './Icons.js';
export function WebsiteForm({
  onSubmit,
  initialName = '',
  initialOrigins = [''],
  submitLabel = 'Add website'
}: {
  onSubmit: (input: { name: string; allowedOrigins: string[] }) => Promise<void>;
  initialName?: string;
  initialOrigins?: string[];
  submitLabel?: string;
}) {
  const [name, setName] = useState(initialName);
  const [origins, setOrigins] = useState(initialOrigins.join('\n'));
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await onSubmit({ name: name.trim(), allowedOrigins: origins.split(/\s+/).filter(Boolean) });
      if (!initialName) {
        setName('');
        setOrigins('');
      }
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="website-form" onSubmit={(event) => void submit(event)}>
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
          aria-describedby="origins-help"
        />
      </label>
      <small id="origins-help">One exact http or https origin per line.</small>
      <button className="primary" disabled={busy}>
        {!busy && submitLabel === 'Add website' && <PlusIcon size={16} />}
        {busy ? 'Saving…' : submitLabel}
      </button>
    </form>
  );
}
