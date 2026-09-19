import { useRef, useState } from 'react';

export function WorkspaceContextHelp() {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  return (
    <div className="workspace-context">
      <button
        ref={trigger}
        className="local-pill"
        type="button"
        aria-expanded={open}
        aria-controls="workspace-context-explanation"
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => {
          if (event.key !== 'Escape') return;
          setOpen(false);
          trigger.current?.focus();
        }}
      >
        <span aria-hidden="true" />
        <span className="local-pill-label">Local workspace</span>
      </button>
      {open && (
        <div
          id="workspace-context-explanation"
          className="workspace-context-explanation"
          role="region"
          aria-label="Local workspace explanation"
          onKeyDown={(event) => {
            if (event.key !== 'Escape') return;
            setOpen(false);
            trigger.current?.focus();
          }}
        >
          <strong>What “Local workspace” means</strong>
          <p>
            This console interface and its trusted, credential-holding loopback service run only on
            this computer. The selected analytics backend and stored analytics may be remote.
          </p>
          <p>
            <strong>Private by design.</strong> Credentials stay on this machine. Every report is a
            bounded aggregate, and visitor identifiers never reach this browser.
          </p>
          <button className="secondary" type="button" onClick={() => setOpen(false)}>
            Close
          </button>
        </div>
      )}
    </div>
  );
}
