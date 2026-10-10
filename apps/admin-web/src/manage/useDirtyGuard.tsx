import { useCallback, useState, type MouseEvent, type ReactNode } from 'react';
import { ConfirmDialog } from '../components/ConfirmDialog.js';

/**
 * Asks before the page's own leave controls (back link, Cancel) throw away unsaved changes.
 * The browser's back button and closing the tab are deliberately not covered.
 */
export function useDirtyGuard(dirty: boolean): {
  /** Click handler for a link to `href`: lets the link work when clean, asks when dirty. */
  guard: (href: string) => (event: MouseEvent<HTMLAnchorElement>) => void;
  dialog: ReactNode;
} {
  const [pending, setPending] = useState<string>();

  const guard = useCallback(
    (href: string) => (event: MouseEvent<HTMLAnchorElement>) => {
      if (!dirty) return;
      event.preventDefault();
      setPending(href);
    },
    [dirty]
  );

  const dialog = pending ? (
    <ConfirmDialog
      title="Discard your changes?"
      confirmLabel="Discard changes"
      cancelLabel="Keep editing"
      onConfirm={() => {
        window.location.hash = pending;
        setPending(undefined);
      }}
      onCancel={() => setPending(undefined)}
    >
      <p>You have unsaved changes. If you leave now they will be lost.</p>
    </ConfirmDialog>
  ) : null;

  return { guard, dialog };
}
