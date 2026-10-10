// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TimeRangeSelector } from '../src/components/TimeRangeSelector.js';
import { presetToRange, type AppliedRange } from '../src/time-range.js';

afterEach(() => cleanup());

function setup(applied: AppliedRange = presetToRange('24h', new Date('2026-01-15T12:00:00.000Z'))) {
  const onApply = vi.fn();
  render(<TimeRangeSelector applied={applied} onApply={onApply} />);
  return { onApply };
}

describe('TimeRangeSelector', () => {
  it('shows the applied range summary on the trigger and opens a dialog with preset radios and Custom', async () => {
    const user = userEvent.setup();
    setup();
    expect(screen.getByRole('button', { name: 'Last 24 hours' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Last 24 hours' }));
    expect(screen.getByRole('dialog', { name: 'Choose a time range' })).toBeTruthy();
    for (const label of [
      'Last 6 hours',
      'Last 12 hours',
      'Last 24 hours',
      'Last 7 days',
      'Last 30 days',
      'Custom'
    ]) {
      expect(screen.getByRole('radio', { name: label })).toBeTruthy();
    }
  });

  it('reveals From/To controls and a visible timezone label only when Custom is selected', async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole('button', { name: 'Last 24 hours' }));
    expect(screen.queryByLabelText('From')).toBeNull();
    await user.click(screen.getByRole('radio', { name: 'Custom' }));
    expect(screen.getByLabelText('From')).toBeTruthy();
    expect(screen.getByLabelText('To')).toBeTruthy();
    expect(screen.getByText(/Times shown in/)).toBeTruthy();
  });

  it('applies a chosen preset and closes the popover only on Apply', async () => {
    const user = userEvent.setup();
    const { onApply } = setup();
    await user.click(screen.getByRole('button', { name: 'Last 24 hours' }));
    await user.click(screen.getByRole('radio', { name: 'Last 7 days' }));
    expect(onApply).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply.mock.calls[0]![0]).toMatchObject({ kind: 'preset', preset: '7d' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('applies a valid custom range converted to UTC', async () => {
    const user = userEvent.setup();
    const { onApply } = setup();
    await user.click(screen.getByRole('button', { name: 'Last 24 hours' }));
    await user.click(screen.getByRole('radio', { name: 'Custom' }));
    const from = screen.getByLabelText('From') as HTMLInputElement;
    const to = screen.getByLabelText('To') as HTMLInputElement;
    await user.clear(from);
    await user.type(from, '2026-01-01T00:00');
    await user.clear(to);
    await user.type(to, '2026-01-02T00:00');
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    expect(onApply).toHaveBeenCalledTimes(1);
    const applied = onApply.mock.calls[0]![0] as AppliedRange;
    expect(applied.kind).toBe('custom');
    expect(applied.startUtc).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:00:00\.000Z$/);
  });

  it('rejects a reversed custom range with an inline error and issues no request', async () => {
    const user = userEvent.setup();
    const { onApply } = setup();
    await user.click(screen.getByRole('button', { name: 'Last 24 hours' }));
    await user.click(screen.getByRole('radio', { name: 'Custom' }));
    const from = screen.getByLabelText('From') as HTMLInputElement;
    const to = screen.getByLabelText('To') as HTMLInputElement;
    await user.clear(from);
    await user.type(from, '2026-01-02T00:00');
    await user.clear(to);
    await user.type(to, '2026-01-01T00:00');
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    expect(onApply).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('preserves an unapplied draft edit across dismiss and reopen', async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole('button', { name: 'Last 24 hours' }));
    await user.click(screen.getByRole('radio', { name: 'Last 30 days' }));
    await user.keyboard('{Escape}');
    expect(screen.getByRole('dialog', { hidden: true })).toHaveProperty('hidden', true);
    await user.click(screen.getByRole('button', { name: 'Last 24 hours' }));
    expect((screen.getByRole('radio', { name: 'Last 30 days' }) as HTMLInputElement).checked).toBe(
      true
    );
  });

  it('dismisses on Escape without applying and returns focus to the trigger', async () => {
    const user = userEvent.setup();
    const { onApply } = setup();
    const trigger = screen.getByRole('button', { name: 'Last 24 hours' });
    await user.click(trigger);
    await user.keyboard('{Escape}');
    expect(onApply).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(trigger);
  });

  it('dismisses on an outside click (light dismiss) without applying', async () => {
    const user = userEvent.setup();
    const { onApply } = setup();
    await user.click(screen.getByRole('button', { name: 'Last 24 hours' }));
    await user.click(document.body);
    expect(onApply).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { hidden: true })).toHaveProperty('hidden', true);
  });

  it('returns focus to the trigger after Cancel', async () => {
    const user = userEvent.setup();
    setup();
    const trigger = screen.getByRole('button', { name: 'Last 24 hours' });
    await user.click(trigger);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(document.activeElement).toBe(trigger);
  });

  it('declares a narrow-reflow style rule for the popover', () => {
    const css = readFileSync(join(process.cwd(), 'apps/admin-web/src/styles.css'), 'utf8');
    expect(css).toContain('@media (max-width: 959px)');
    expect(css).toMatch(/\.time-range-popover\s*{[^}]*}/);
  });
});
