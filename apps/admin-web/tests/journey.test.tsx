// @vitest-environment jsdom
import { act, cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SetupState } from '../src/api/local-operations.js';
import { AnalyticsSetupHint, Journey } from '../src/setup/Journey.js';
import { SetupProvider } from '../src/setup/SetupProvider.js';
import { connectedState, DONE, unfinishedState, stages } from './fixtures/setup.js';

const api = vi.hoisted(() => ({ getSetupState: vi.fn() }));
vi.mock('../src/api/local-operations.js', async (load) => ({ ...(await load()), ...api }));

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
});
beforeEach(() => {
  api.getSetupState.mockResolvedValue(connectedState());
});

const show = (state: SetupState | undefined, child = <Journey />) =>
  render(<SetupProvider initial={state}>{child}</SetupProvider>);
const showHint = (state: SetupState | undefined) => show(state, <AnalyticsSetupHint />);

describe('Journey', () => {
  it('shows the four stages in order, marking the current one', () => {
    show(unfinishedState());
    const list = screen.getByRole('list');
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(4);
    expect(
      items.map(
        (item) =>
          within(item).getByText(
            /Console running|Backend connected|Website configured|Data arriving/
          ).textContent
      )
    ).toEqual(['Console running', 'Backend connected', 'Website configured', 'Data arriving']);
    expect(items[2]!.getAttribute('aria-current')).toBe('step');
    expect(items[0]!.getAttribute('aria-current')).toBeNull();
  });

  it('says each status in words as well as with an icon', () => {
    show(unfinishedState());
    const items = screen.getAllByRole('listitem');
    expect(items[0]!.textContent).toContain('Done');
    expect(items[2]!.textContent).toContain('Current step');
    expect(items[3]!.textContent).toContain('To do');
    show({
      ...unfinishedState(),
      stages: stages(['done', 'blocked', 'blocked', 'blocked'], { id: 'check-backend', label: 'x' })
    });
    expect(screen.getAllByText('Blocked').length).toBeGreaterThan(0);
  });

  it('offers exactly one next action, as a link when there is somewhere to go', () => {
    show(unfinishedState());
    const next = screen.getByText('Next:').parentElement!;
    expect(
      within(next)
        .getByRole('link', { name: 'Create a project and add a website' })
        .getAttribute('href')
    ).toBe('#/manage/projects');
  });

  it('shows plain text when the next step has nowhere to go', () => {
    show(
      connectedState('analyst', {
        stages: stages(['done', 'done', 'current', 'todo'], {
          id: 'nothing-yet',
          label: 'Nothing to see yet. Ask your admin.'
        })
      })
    );
    const next = screen.getByText('Next:').parentElement!;
    expect(next.textContent).toContain('Nothing to see yet. Ask your admin.');
    expect(within(next).queryByRole('link')).toBeNull();
  });

  it.each([
    ['admin', 'Create a project and add a website', '#/manage/projects'],
    ['owner', 'Add your website', '#/manage/websites/new']
  ] as const)('follows the table for a %s with a backend and no website', (role, label, href) => {
    show(
      connectedState(role, {
        stages: stages(['done', 'done', 'current', 'todo'], { id: 'x', label, href })
      })
    );
    expect(screen.getByRole('link', { name: label }).getAttribute('href')).toBe(href);
  });

  it('hides once data is arriving, and when there is no state to show', () => {
    show(connectedState('admin', { stages: stages(DONE) }));
    expect(screen.queryByRole('list')).toBeNull();
    cleanup();
    show(undefined);
    expect(screen.queryByRole('list')).toBeNull();
    cleanup();
    showHint(undefined);
    expect(screen.queryByRole('status')).toBeNull();
  });
});

describe('AnalyticsSetupHint', () => {
  it('explains why there is nothing to see, and what to do', () => {
    showHint(
      connectedState('admin', {
        stages: stages(['done', 'done', 'current', 'todo'], {
          id: 'create-project',
          label: 'Create a project and add a website',
          href: '#/manage/projects'
        })
      })
    );
    const hint = screen.getByRole('status');
    expect(hint.textContent).toContain('no website is registered');
    expect(
      within(hint).getByRole('link', { name: 'Create a project and add a website' })
    ).toBeTruthy();
  });

  it('says data has not arrived yet once a website exists', () => {
    showHint(
      connectedState('analyst', {
        stages: stages(['done', 'done', 'done', 'current'], {
          id: 'waiting-for-data',
          label: 'Waiting for the first data.'
        })
      })
    );
    expect(screen.getByRole('status').textContent).toContain('no data has arrived');
    expect(screen.getByRole('status').textContent).toContain('Waiting for the first data.');
  });

  it('stays out of the way when the backend is not connected or the journey is done', () => {
    showHint({
      ...connectedState(),
      connection: { status: 'unreachable' },
      stages: stages(['done', 'blocked', 'blocked', 'blocked'])
    });
    expect(screen.queryByRole('status')).toBeNull();
    cleanup();
    showHint(
      connectedState('admin', {
        stages: stages(['done', 'current', 'todo', 'todo'], { id: 'x', label: 'x' })
      })
    );
    expect(screen.queryByRole('status')).toBeNull();
  });
});

describe('SetupProvider', () => {
  it('asks again every 30 seconds while the journey is unfinished, and then stops', async () => {
    vi.useFakeTimers();
    api.getSetupState.mockResolvedValue(
      connectedState('admin', {
        stages: stages(['done', 'done', 'done', 'current'], {
          id: 'install-website',
          label: 'Follow the install steps, then check'
        })
      })
    );
    show(
      connectedState('admin', {
        stages: stages(['done', 'done', 'current', 'todo'], {
          id: 'create-project',
          label: 'Create a project and add a website'
        })
      })
    );
    expect(api.getSetupState).not.toHaveBeenCalled();
    await act(async () => void (await vi.advanceTimersByTimeAsync(30_000)));
    expect(api.getSetupState).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/install steps/)).toBeTruthy();
    api.getSetupState.mockResolvedValue(connectedState());
    await act(async () => void (await vi.advanceTimersByTimeAsync(30_000)));
    expect(screen.queryByRole('list')).toBeNull();
    api.getSetupState.mockClear();
    await act(async () => void (await vi.advanceTimersByTimeAsync(120_000)));
    expect(api.getSetupState).not.toHaveBeenCalled();
  });

  it('keeps what it knew when asking fails', async () => {
    vi.useFakeTimers();
    api.getSetupState.mockRejectedValue(new Error('offline'));
    show(unfinishedState());
    await act(async () => void (await vi.advanceTimersByTimeAsync(30_000)));
    expect(screen.getAllByRole('listitem')).toHaveLength(4);
  });

  it('does not ask while the page is hidden', async () => {
    vi.useFakeTimers();
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    show(unfinishedState());
    await act(async () => void (await vi.advanceTimersByTimeAsync(60_000)));
    expect(api.getSetupState).not.toHaveBeenCalled();
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  });
});
