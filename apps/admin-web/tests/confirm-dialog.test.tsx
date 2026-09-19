// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ActionButton } from '../src/components/ActionButton.js';
import { ConfirmDialog } from '../src/components/ConfirmDialog.js';

afterEach(cleanup);

function Harness({ onConfirm, requireText }: { onConfirm: () => void; requireText?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>Open</button>
      {open && (
        <ConfirmDialog
          title="Delete thing?"
          confirmLabel="Delete"
          {...(requireText ? { requireText } : {})}
          onConfirm={onConfirm}
          onCancel={() => setOpen(false)}
        >
          <p>This is permanent.</p>
        </ConfirmDialog>
      )}
    </>
  );
}

describe('ConfirmDialog', () => {
  it('is an accessible alert dialog with focus on Cancel and focus returned on close', async () => {
    const user = userEvent.setup();
    render(<Harness onConfirm={() => undefined} />);
    const opener = screen.getByRole('button', { name: 'Open' });
    await user.click(opener);
    const dialog = screen.getByRole('alertdialog', { name: 'Delete thing?' });
    expect(dialog.getAttribute('aria-describedby')).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Cancel' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it('cancels on Escape and traps Tab in both directions', async () => {
    const user = userEvent.setup();
    render(<Harness onConfirm={() => undefined} />);
    await user.click(screen.getByRole('button', { name: 'Open' }));
    const cancel = screen.getByRole('button', { name: 'Cancel' });
    const confirm = screen.getByRole('button', { name: 'Delete' });
    await user.tab();
    expect(document.activeElement).toBe(confirm);
    await user.tab();
    expect(document.activeElement).toBe(cancel);
    await user.tab({ shift: true });
    expect(document.activeElement).toBe(confirm);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('confirms only after the required text is typed exactly', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<Harness onConfirm={onConfirm} requireText="Acme" />);
    await user.click(screen.getByRole('button', { name: 'Open' }));
    const confirm = screen.getByRole('button', { name: 'Delete' }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    await user.type(screen.getByLabelText(/Type/), 'acme');
    expect(confirm.disabled).toBe(true);
    await user.clear(screen.getByLabelText(/Type/));
    await user.type(screen.getByLabelText(/Type/), 'Acme');
    expect(confirm.disabled).toBe(false);
    await user.click(confirm);
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it('disables confirmation while busy', () => {
    render(
      <ConfirmDialog
        title="t"
        confirmLabel="Delete"
        busy
        onConfirm={() => undefined}
        onCancel={() => undefined}
      >
        body
      </ConfirmDialog>
    );
    expect((screen.getByRole('button', { name: 'Working…' }) as HTMLButtonElement).disabled).toBe(
      true
    );
  });
});

describe('ActionButton', () => {
  it('tags the control with its capability and rejects unknown capabilities', () => {
    render(<ActionButton capability="delete-website">Delete</ActionButton>);
    expect(screen.getByRole('button', { name: 'Delete' }).getAttribute('data-capability')).toBe(
      'delete-website'
    );
    expect(() => render(<ActionButton capability={'nope' as never}>x</ActionButton>)).toThrow(
      /Unknown capability/
    );
  });
});
