import { useCallback, useEffect, useRef, useState } from 'react';
import { getThemePreference, putThemePreference, type Theme } from './api/local-operations.js';

export type { Theme };

function systemTheme(): Theme {
  try {
    return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

/** Applies the resolved theme to the document: data-theme only when explicit, always color-scheme. */
export function applyDocumentTheme(resolved: Theme, explicit: Theme | null): void {
  const root = document.documentElement;
  if (explicit) root.setAttribute('data-theme', explicit);
  else root.removeAttribute('data-theme');
  root.setAttribute('data-resolved-theme', resolved);
  root.style.colorScheme = resolved;
}

export interface ThemeController {
  /** The theme actually in effect: the explicit preference, or the system theme if none is set. */
  theme: Theme;
  /** The persisted explicit choice, or null while following the system. */
  explicit: Theme | null;
  saving: boolean;
  saveError: boolean;
  setTheme: (next: Theme) => void;
}

export function useTheme(): ThemeController {
  const [system, setSystem] = useState<Theme>(() => systemTheme());
  const [explicit, setExplicit] = useState<Theme | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const generation = useRef(0);

  useEffect(() => {
    let media: MediaQueryList | undefined;
    try {
      media = matchMedia('(prefers-color-scheme: dark)');
    } catch {
      return;
    }
    const onChange = () => setSystem(media!.matches ? 'dark' : 'light');
    media.addEventListener('change', onChange);
    return () => media?.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    let cancelled = false;
    getThemePreference()
      .then((result) => {
        if (!cancelled && result.theme) setExplicit(result.theme);
      })
      .catch(() => {
        // Unreachable or corrupt preference storage must not block the console;
        // this session simply follows the system theme until it can be read.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const resolved = explicit ?? system;

  useEffect(() => {
    applyDocumentTheme(resolved, explicit);
  }, [resolved, explicit]);

  const setTheme = useCallback((next: Theme) => {
    setExplicit(next);
    setSaveError(false);
    setSaving(true);
    const requestGeneration = ++generation.current;
    putThemePreference(next)
      .catch(() => {
        if (generation.current === requestGeneration) setSaveError(true);
      })
      .finally(() => {
        if (generation.current === requestGeneration) setSaving(false);
      });
  }, []);

  return { theme: resolved, explicit, saving, saveError, setTheme };
}
