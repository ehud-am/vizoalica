// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ThemeToggle } from '../src/components/ThemeToggle.js';

afterEach(() => cleanup());

describe('ThemeToggle', () => {
  it('marks Light pressed when the resolved theme is light', () => {
    render(<ThemeToggle theme="light" saving={false} saveError={false} onChange={() => {}} />);
    expect(screen.getByRole('button', { name: 'Light' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Dark' }).getAttribute('aria-pressed')).toBe('false');
    expect(document.querySelectorAll('.theme-toggle svg')).toHaveLength(2);
  });

  it('marks Dark pressed when the resolved theme is dark', () => {
    render(<ThemeToggle theme="dark" saving={false} saveError={false} onChange={() => {}} />);
    expect(screen.getByRole('button', { name: 'Dark' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('calls onChange with the clicked theme', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ThemeToggle theme="light" saving={false} saveError={false} onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: 'Dark' }));
    expect(onChange).toHaveBeenCalledWith('dark');
    await user.click(screen.getByRole('button', { name: 'Light' }));
    expect(onChange).toHaveBeenCalledWith('light');
  });

  it('shows a saving status while a save is in flight', () => {
    render(<ThemeToggle theme="dark" saving saveError={false} onChange={() => {}} />);
    expect(screen.getByRole('status').textContent).toBe('Saving theme…');
  });

  it('shows no status text when idle and no error', () => {
    render(<ThemeToggle theme="dark" saving={false} saveError={false} onChange={() => {}} />);
    expect(screen.getByRole('status').textContent).toBe('');
  });
});
