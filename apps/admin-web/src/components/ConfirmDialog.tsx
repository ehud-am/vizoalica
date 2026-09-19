import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), [href], select, textarea';

/**
 * Accessible confirmation for destructive actions. Focus starts on Cancel, is trapped inside the
 * dialog, Escape cancels, and focus returns to whatever opened it. `requireText` asks the user to
 * type a value (for example a project name) before the confirm button enables.
 */
export function ConfirmDialog({
  title,
  confirmLabel,
  cancelLabel = 'Cancel',
  requireText,
  busy = false,
  onConfirm,
  onCancel,
  children
}: {
  title: string;
  confirmLabel: string;
  cancelLabel?: string;
  requireText?: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  children: ReactNode;
}) {
  const titleId = useId();
  const bodyId = useId();
  const inputId = useId();
  const root = useRef<HTMLDivElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const [typed, setTyped] = useState('');
  const opener = useRef<Element | null>(null);
  const confirmed = requireText === undefined || typed === requireText;

  useEffect(() => {
    opener.current = document.activeElement;
    cancel.current?.focus();
    return () => {
      if (opener.current instanceof HTMLElement) opener.current.focus();
    };
  }, []);

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onCancel();
      return;
    }
    if (event.key !== 'Tab' || !root.current) return;
    const items = Array.from(root.current.querySelectorAll<HTMLElement>(FOCUSABLE));
    const first = items[0]!;
    const last = items[items.length - 1]!;
    const active = document.activeElement;
    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <div className="dialog-backdrop">
      <div
        ref={root}
        className="dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        onKeyDown={onKeyDown}
      >
        <h2 id={titleId}>{title}</h2>
        <div id={bodyId} className="dialog-body">
          {children}
        </div>
        {requireText !== undefined && (
          <label htmlFor={inputId}>
            Type <strong>{requireText}</strong> to confirm
            <input
              id={inputId}
              value={typed}
              autoComplete="off"
              onChange={(event) => setTyped(event.target.value)}
            />
          </label>
        )}
        <div className="dialog-actions">
          <button ref={cancel} type="button" className="secondary" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className="danger"
            disabled={!confirmed || busy}
            onClick={onConfirm}
          >
            {busy ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
