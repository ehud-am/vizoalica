import { useEffect, useRef, useState } from 'react';
import { CopyIcon } from './Icons.js';

type State = 'idle' | 'copied' | 'failed';

/**
 * Copies text and says so in place. The visible word changes, and a live region announces it, so
 * the result never depends on looking at a distant status line.
 */
export function CopyButton({
  text,
  what,
  className = 'secondary',
  disabled = false
}: {
  text: string;
  /** What is copied, for the accessible name and the announcement: "workflow file". */
  what: string;
  className?: string;
  disabled?: boolean;
}) {
  const [state, setState] = useState<State>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  async function copy() {
    clearTimeout(timer.current);
    try {
      await navigator.clipboard.writeText(text);
      setState('copied');
    } catch {
      setState('failed');
    }
    timer.current = setTimeout(() => setState('idle'), 3000);
  }

  return (
    <>
      <button
        className={`${className} copy-button`}
        type="button"
        disabled={disabled}
        aria-label={`Copy ${what}`}
        onClick={() => void copy()}
      >
        <CopyIcon size={16} />
        {state === 'copied' ? 'Copied' : 'Copy'}
      </button>
      <span className="sr-only" role="status">
        {state === 'copied'
          ? `${what[0]!.toUpperCase()}${what.slice(1)} copied to clipboard.`
          : state === 'failed'
            ? 'Copying is not available here. Select the text and copy it.'
            : ''}
      </span>
      {state === 'failed' && (
        <span className="copy-failed" aria-hidden="true">
          Copying is not available. Select the text instead.
        </span>
      )}
    </>
  );
}
