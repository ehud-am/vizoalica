// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App.js';
import { makeOverview } from './fixtures/console.js';

const api = vi.hoisted(() => ({
  bootstrapSession: vi.fn(),
  listProjects: vi.fn(),
  listWebsites: vi.fn(),
  getAnalyticsOverview: vi.fn()
}));
vi.mock('../src/api/local-operations.js', async (load) => ({ ...(await load()), ...api }));

beforeEach(() => {
  api.bootstrapSession.mockResolvedValue(undefined);
  api.listProjects.mockResolvedValue([{ id: 'p1', name: 'Acme' }]);
  api.listWebsites.mockResolvedValue([]);
  api.getAnalyticsOverview.mockResolvedValue(makeOverview());
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// Each load asks for the selected range and for the equally long range before it.

describe('time range selector to local API', () => {
  it.each([
    ['Last 6 hours', 6],
    ['Last 12 hours', 12],
    ['Last 24 hours', 24],
    ['Last 7 days', 24 * 7],
    ['Last 30 days', 24 * 30]
  ])('applies %s and requests exactly that span from the local API', async (label, hours) => {
    const user = userEvent.setup();
    render(<App />);
    await waitFor(() => expect(api.getAnalyticsOverview).toHaveBeenCalledTimes(2));
    api.getAnalyticsOverview.mockClear();

    await user.click(await screen.findByRole('button', { name: /^Last/ }));
    await user.click(screen.getByRole('radio', { name: label }));
    await user.click(screen.getByRole('button', { name: 'Apply' }));

    await waitFor(() => expect(api.getAnalyticsOverview).toHaveBeenCalledTimes(2));
    const [, , startUtc, endUtc] = api.getAnalyticsOverview.mock.calls[0]!;
    const spanMs = new Date(endUtc).getTime() - new Date(startUtc).getTime();
    expect(spanMs).toBe(hours * 60 * 60 * 1000);
    expect(await screen.findByRole('button', { name: label })).toBeTruthy();
  });

  it('applies one valid custom range and requests exactly its UTC boundaries', async () => {
    const user = userEvent.setup();
    render(<App />);
    await waitFor(() => expect(api.getAnalyticsOverview).toHaveBeenCalledTimes(2));
    api.getAnalyticsOverview.mockClear();

    await user.click(await screen.findByRole('button', { name: /^Last/ }));
    await user.click(screen.getByRole('radio', { name: 'Custom' }));
    const from = screen.getByLabelText('From') as HTMLInputElement;
    const to = screen.getByLabelText('To') as HTMLInputElement;
    await user.clear(from);
    await user.type(from, '2026-01-01T00:00');
    await user.clear(to);
    await user.type(to, '2026-01-02T00:00');
    await user.click(screen.getByRole('button', { name: 'Apply' }));

    await waitFor(() => expect(api.getAnalyticsOverview).toHaveBeenCalledTimes(2));
    const [, , startUtc, endUtc] = api.getAnalyticsOverview.mock.calls[0]!;
    expect(new Date(endUtc).getTime() - new Date(startUtc).getTime()).toBe(24 * 60 * 60 * 1000);
  });

  it('issues no request for an invalid custom range and keeps the prior applied range active', async () => {
    const user = userEvent.setup();
    render(<App />);
    await waitFor(() => expect(api.getAnalyticsOverview).toHaveBeenCalledTimes(2));
    api.getAnalyticsOverview.mockClear();

    await user.click(await screen.findByRole('button', { name: 'Last 24 hours' }));
    await user.click(screen.getByRole('radio', { name: 'Custom' }));
    const from = screen.getByLabelText('From') as HTMLInputElement;
    const to = screen.getByLabelText('To') as HTMLInputElement;
    await user.clear(from);
    await user.type(from, '2026-01-02T00:00');
    await user.clear(to);
    await user.type(to, '2026-01-01T00:00');
    await user.click(screen.getByRole('button', { name: 'Apply' }));

    expect(api.getAnalyticsOverview).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Last 24 hours' })).toBeTruthy();
  });
});
