// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CodeBlock } from '../src/components/CodeBlock.js';
import { CopyButton } from '../src/components/CopyButton.js';
import { PageHeader } from '../src/components/PageHeader.js';
import { Tabs } from '../src/components/Tabs.js';
import { useDirtyGuard } from '../src/manage/useDirtyGuard.js';
import { FlashMessage, FlashProvider, useFlash } from '../src/shell/FlashProvider.js';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function stubClipboard(writeText: () => Promise<void>) {
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
}

describe('PageHeader', () => {
  it('shows the trail, marks the last item as the current page, and offers a back link', () => {
    const onBack = vi.fn((event: React.MouseEvent) => event.preventDefault());
    render(
      <PageHeader
        crumbs={[
          { label: 'Acme' },
          { label: 'Websites', href: '#/manage/websites' },
          { label: 'Edit' }
        ]}
        title="Edit Docs"
        description="Change things."
        back={{ label: 'Back to Docs', href: '#/manage/websites/s1', onClick: onBack }}
        status={<span>active</span>}
        actions={<button>Do</button>}
      />
    );
    const trail = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(within(trail).getByRole('link', { name: 'Websites' }).getAttribute('href')).toBe(
      '#/manage/websites'
    );
    expect(within(trail).getByText('Edit').getAttribute('aria-current')).toBe('page');
    expect(within(trail).getByText('Acme').getAttribute('aria-current')).toBeNull();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('Edit Docs');
    fireEvent.click(screen.getByRole('link', { name: /Back to Docs/ }));
    expect(onBack).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Do' })).toBeTruthy();
  });
});

describe('CopyButton and CodeBlock', () => {
  it('copies, says so in place and to assistive technology, then resets', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubClipboard(writeText);
    render(<CodeBlock label="Workflow" code="name: x" what="workflow file" />);
    const button = screen.getByRole('button', { name: 'Copy workflow file' });
    expect(button.textContent).toContain('Copy');
    await act(async () => {
      fireEvent.click(button);
    });
    expect(writeText).toHaveBeenCalledWith('name: x');
    expect(button.textContent).toContain('Copied');
    expect(screen.getByText('Workflow file copied to clipboard.')).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(3100);
    });
    expect(button.textContent).not.toContain('Copied');
    expect(screen.queryByText('Workflow file copied to clipboard.')).toBeNull();
  });

  it('says so when copying is not available, and can be disabled', async () => {
    stubClipboard(vi.fn().mockRejectedValue(new Error('denied')));
    const { rerender } = render(<CopyButton text="x" what="snippet" />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy snippet' }));
    });
    expect(
      screen.getByText('Copying is not available here. Select the text and copy it.')
    ).toBeTruthy();
    rerender(<CopyButton text="x" what="snippet" disabled />);
    expect(
      (screen.getByRole('button', { name: 'Copy snippet' }) as HTMLButtonElement).disabled
    ).toBe(true);
  });
});

describe('Tabs', () => {
  type Id = 'a' | 'b' | 'c';
  function Harness({ variant }: { variant?: 'cards' | 'segmented' }) {
    const [value, setValue] = useState<Id>('a');
    return (
      <Tabs<Id>
        label="Choose"
        value={value}
        onChange={setValue}
        {...(variant ? { variant } : {})}
        items={[
          { id: 'a', label: 'Alpha', description: 'The first' },
          { id: 'b', label: 'Beta', disabled: true },
          { id: 'c', label: 'Gamma', content: <b>Custom Gamma</b> }
        ]}
      >
        <p>Panel for {value}</p>
      </Tabs>
    );
  }

  it('exposes tab semantics, roving focus, and one panel labelled by the selected tab', () => {
    render(<Harness />);
    const tabs = screen.getAllByRole('tab');
    expect(screen.getByRole('tablist', { name: 'Choose' })).toBeTruthy();
    expect(tabs.map((tab) => tab.getAttribute('aria-selected'))).toEqual([
      'true',
      'false',
      'false'
    ]);
    expect(tabs.map((tab) => tab.getAttribute('tabindex'))).toEqual(['0', '-1', '-1']);
    const panel = screen.getByRole('tabpanel');
    expect(panel.getAttribute('aria-labelledby')).toBe(tabs[0]!.id);
    expect(tabs[0]!.getAttribute('aria-controls')).toBe(panel.id);
    expect(within(tabs[0]!).getByText('The first')).toBeTruthy();
    expect(screen.getByText('Custom Gamma')).toBeTruthy();
    expect(tabs[1]!.hasAttribute('disabled')).toBe(true);
  });

  it('moves and selects with arrows, Home, and End, skipping disabled tabs', async () => {
    const user = userEvent.setup();
    render(<Harness variant="cards" />);
    screen.getByRole('tab', { name: 'Alpha' }).focus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByText('Panel for c')).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Gamma' }));
    await user.keyboard('{ArrowRight}');
    expect(screen.getByText('Panel for a')).toBeTruthy();
    await user.keyboard('{ArrowLeft}');
    expect(screen.getByText('Panel for c')).toBeTruthy();
    await user.keyboard('{Home}');
    expect(screen.getByText('Panel for a')).toBeTruthy();
    await user.keyboard('{End}');
    expect(screen.getByText('Panel for c')).toBeTruthy();
    await user.keyboard('{Tab}');
    await user.click(screen.getByRole('tab', { name: 'Alpha' }));
    expect(screen.getByText('Panel for a')).toBeTruthy();
  });
});

describe('FlashProvider', () => {
  function Harness({ routeKey }: { routeKey: string }) {
    return (
      <FlashProvider routeKey={routeKey}>
        <Controls />
        <FlashMessage />
      </FlashProvider>
    );
  }
  function Controls() {
    const flash = useFlash();
    return (
      <>
        <button onClick={() => flash.show('shown here')}>show</button>
        <button onClick={() => flash.carry('carried on')}>carry</button>
      </>
    );
  }

  it('has an announcing region before there is a message', () => {
    render(<Harness routeKey="a" />);
    expect(screen.getByRole('status').textContent).toBe('');
  });

  it('drops a shown message at the next navigation', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<Harness routeKey="a" />);
    await user.click(screen.getByRole('button', { name: 'show' }));
    expect(screen.getByText('shown here')).toBeTruthy();
    rerender(<Harness routeKey="b" />);
    expect(screen.queryByText('shown here')).toBeNull();
  });

  it('carries a message across exactly one navigation, and can be dismissed', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<Harness routeKey="a" />);
    await user.click(screen.getByRole('button', { name: 'carry' }));
    rerender(<Harness routeKey="b" />);
    expect(screen.getByText('carried on')).toBeTruthy();
    rerender(<Harness routeKey="c" />);
    expect(screen.queryByText('carried on')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'show' }));
    await user.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByText('shown here')).toBeNull();
  });

  it('requires its provider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => render(<Controls />)).toThrow(/inside FlashProvider/);
    spy.mockRestore();
  });
});

describe('useDirtyGuard', () => {
  function Harness({ dirty }: { dirty: boolean }) {
    const { guard, dialog } = useDirtyGuard(dirty);
    return (
      <>
        <a href="#/somewhere" onClick={guard('#/somewhere')}>
          Leave
        </a>
        {dialog}
      </>
    );
  }

  it('lets the link work when nothing changed', async () => {
    window.location.hash = '';
    render(<Harness dirty={false} />);
    await userEvent.setup().click(screen.getByRole('link', { name: 'Leave' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(window.location.hash).toBe('#/somewhere');
  });

  it('asks first when there are unsaved changes, defaulting to keep editing', async () => {
    window.location.hash = '';
    const user = userEvent.setup();
    render(<Harness dirty />);
    await user.click(screen.getByRole('link', { name: 'Leave' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Discard your changes?' });
    expect(window.location.hash).toBe('');
    expect(document.activeElement).toBe(
      within(dialog).getByRole('button', { name: 'Keep editing' })
    );
    await user.click(within(dialog).getByRole('button', { name: 'Keep editing' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(window.location.hash).toBe('');
    await user.click(screen.getByRole('link', { name: 'Leave' }));
    await user.click(screen.getByRole('button', { name: 'Discard changes' }));
    expect(window.location.hash).toBe('#/somewhere');
  });
});
