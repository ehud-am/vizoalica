// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useTheme } from '../src/theme.js';

const api = vi.hoisted(() => ({
  getThemePreference: vi.fn(),
  putThemePreference: vi.fn()
}));
vi.mock('../src/api/local-operations.js', async (load) => ({ ...(await load()), ...api }));

class FakeMediaQueryList {
  matches: boolean;
  private listeners = new Set<() => void>();
  constructor(matches: boolean) {
    this.matches = matches;
  }
  addEventListener(_type: string, listener: () => void) {
    this.listeners.add(listener);
  }
  removeEventListener(_type: string, listener: () => void) {
    this.listeners.delete(listener);
  }
  set(matches: boolean) {
    this.matches = matches;
    for (const listener of this.listeners) listener();
  }
}

let media: FakeMediaQueryList;

beforeEach(() => {
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.removeAttribute('data-resolved-theme');
  document.documentElement.style.colorScheme = '';
  media = new FakeMediaQueryList(false);
  vi.stubGlobal('matchMedia', () => media);
  api.getThemePreference.mockResolvedValue({ theme: null });
  api.putThemePreference.mockResolvedValue({
    theme: 'dark',
    updatedAt: '2026-01-01T00:00:00.000Z'
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('useTheme', () => {
  it('defaults to the system theme when no explicit preference is stored', async () => {
    const { result } = renderHook(() => useTheme());
    await waitFor(() => expect(api.getThemePreference).toHaveBeenCalled());
    expect(result.current.theme).toBe('light');
    expect(result.current.explicit).toBeNull();
  });

  it('follows a system theme change while no explicit preference is set', async () => {
    const { result } = renderHook(() => useTheme());
    await waitFor(() => expect(api.getThemePreference).toHaveBeenCalled());
    act(() => media.set(true));
    await waitFor(() => expect(result.current.theme).toBe('dark'));
    expect(result.current.explicit).toBeNull();
  });

  it('loads a persisted explicit preference and it takes priority over the system theme', async () => {
    api.getThemePreference.mockResolvedValue({
      theme: 'dark',
      updatedAt: '2026-01-01T00:00:00.000Z'
    });
    const { result } = renderHook(() => useTheme());
    await waitFor(() => expect(result.current.explicit).toBe('dark'));
    expect(result.current.theme).toBe('dark');
    act(() => media.set(true));
    // System flipping to dark too must not change anything once explicit is set.
    expect(result.current.theme).toBe('dark');
  });

  it('applies an explicit choice optimistically before the save resolves', async () => {
    let resolveSave: (value: { theme: 'dark'; updatedAt: string }) => void = () => {};
    api.putThemePreference.mockReturnValue(
      new Promise((resolve) => {
        resolveSave = resolve;
      })
    );
    const { result } = renderHook(() => useTheme());
    await waitFor(() => expect(api.getThemePreference).toHaveBeenCalled());
    act(() => result.current.setTheme('dark'));
    expect(result.current.theme).toBe('dark');
    expect(result.current.explicit).toBe('dark');
    expect(result.current.saving).toBe(true);
    act(() => resolveSave({ theme: 'dark', updatedAt: '2026-01-01T00:00:00.000Z' }));
    await waitFor(() => expect(result.current.saving).toBe(false));
    expect(result.current.saveError).toBe(false);
  });

  it('shows a save-failure notice when persistence fails, without reverting the session choice', async () => {
    api.putThemePreference.mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => useTheme());
    await waitFor(() => expect(api.getThemePreference).toHaveBeenCalled());
    act(() => result.current.setTheme('dark'));
    await waitFor(() => expect(result.current.saveError).toBe(true));
    expect(result.current.theme).toBe('dark');
    expect(result.current.saving).toBe(false);
  });

  it('sets document data-theme and color-scheme for an explicit choice', async () => {
    const { result } = renderHook(() => useTheme());
    await waitFor(() => expect(api.getThemePreference).toHaveBeenCalled());
    act(() => result.current.setTheme('dark'));
    await waitFor(() => expect(document.documentElement.getAttribute('data-theme')).toBe('dark'));
    expect(document.documentElement.style.colorScheme).toBe('dark');
    expect(document.documentElement.getAttribute('data-resolved-theme')).toBe('dark');
  });

  it('removes data-theme (falling back to the system) when following the system default', async () => {
    const { result } = renderHook(() => useTheme());
    await waitFor(() => expect(api.getThemePreference).toHaveBeenCalled());
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
    expect(document.documentElement.style.colorScheme).toBe('light');
    expect(result.current.explicit).toBeNull();
  });
});
