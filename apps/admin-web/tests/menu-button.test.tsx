// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MenuButton, type MenuItem } from '../src/components/MenuButton.js';

afterEach(cleanup);

const items: MenuItem[] = [
  { id: 'prod', label: 'prod', badge: 'admin' },
  { id: 'staging', label: 'staging', badge: 'analyst' },
  { id: 'old', label: 'old', disabled: true, detail: 'Its secret was rotated.' }
];

function Harness({ onChange = vi.fn() }: { onChange?: (id: string) => void }) {
  const [selected, setSelected] = useState('prod');
  return (
    <>
      <MenuButton
        caption="Environment"
        value={selected}
        badge="admin"
        items={items}
        selected={selected}
        onSelect={(id) => {
          setSelected(id);
          onChange(id);
        }}
        links={[{ id: 'keys', label: 'Access keys', href: '#/manage/access' }]}
      />
      <button type="button">after</button>
    </>
  );
}

describe('MenuButton', () => {
  it('shows the value and its badge as separate elements', () => {
    render(<Harness />);
    const trigger = screen.getByRole('button', { name: /Environment/ });
    expect(within(trigger).getByText('prod')).toBeTruthy();
    expect(trigger.querySelector('.menu-badge')!.textContent).toBe('admin');
    expect(trigger.querySelector('.menu-chevron')).toBeTruthy();
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('opens, marks the current item, and shows why an item cannot be chosen', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: /Environment/ }));
    const menu = screen.getByRole('menu', { name: 'Environment' });
    const radios = within(menu).getAllByRole('menuitemradio');
    expect(radios.map((item) => item.getAttribute('aria-checked'))).toEqual([
      'true',
      'false',
      'false'
    ]);
    expect(radios[2]!.getAttribute('aria-disabled')).toBe('true');
    expect(within(menu).getByText('Its secret was rotated.')).toBeTruthy();
    expect(within(menu).getByRole('menuitem', { name: 'Access keys' }).getAttribute('href')).toBe(
      '#/manage/access'
    );
    // Focus lands on the current item.
    expect(document.activeElement).toBe(radios[0]);
  });

  it('chooses with the mouse and closes, returning focus to the button', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Harness onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: /Environment/ }));
    await user.click(screen.getByRole('menuitemradio', { name: /staging/ }));
    expect(onChange).toHaveBeenCalledWith('staging');
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: /Environment/ }));
  });

  it('never chooses a disabled item', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Harness onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: /Environment/ }));
    await user.click(screen.getByRole('menuitemradio', { name: /old/ }));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('menu')).toBeTruthy();
  });

  it('works from the keyboard: Down opens, arrows skip the disabled item, Enter chooses', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Harness onChange={onChange} />);
    screen.getByRole('button', { name: /Environment/ }).focus();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('menu')).toBeTruthy();
    await user.keyboard('{ArrowDown}');
    expect((document.activeElement as HTMLElement).textContent).toContain('staging');
    await user.keyboard('{ArrowDown}');
    // The disabled "old" is skipped: next is the link.
    expect((document.activeElement as HTMLElement).textContent).toBe('Access keys');
    await user.keyboard('{ArrowDown}');
    expect((document.activeElement as HTMLElement).textContent).toContain('prod');
    await user.keyboard('{End}');
    expect((document.activeElement as HTMLElement).textContent).toBe('Access keys');
    await user.keyboard('{Home}{ArrowDown}{Enter}');
    expect(onChange).toHaveBeenCalledWith('staging');
  });

  it('closes on Escape (focus back on the button), on Tab, and on an outside click', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const trigger = screen.getByRole('button', { name: /Environment/ });
    await user.click(trigger);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(trigger);
    await user.click(trigger);
    await user.keyboard('{Tab}');
    expect(screen.queryByRole('menu')).toBeNull();
    await user.click(trigger);
    await user.click(document.body);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('shows a list of one as plain text, with no menu to open', () => {
    render(
      <MenuButton
        caption="Environment"
        value="prod"
        badge="admin"
        items={[{ id: 'prod', label: 'prod' }]}
        selected="prod"
        onSelect={() => undefined}
        menu={false}
        title="https://worker.test"
      />
    );
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText('prod')).toBeTruthy();
    expect(screen.getByText('admin')).toBeTruthy();
    expect(screen.getByTitle('https://worker.test')).toBeTruthy();
  });
});
