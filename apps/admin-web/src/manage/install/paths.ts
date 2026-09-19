import type {
  DynamicInstallation,
  Integration,
  StaticInstallation
} from '../../api/local-operations.js';

export type InstallPath = 'github' | 'snippet';

/** The path the docs recommend, and the one selected when nothing was chosen before. */
export const RECOMMENDED_PATH: InstallPath = 'github';

export const GUIDE_URL = 'https://github.com/ehud-am/vizoalica/blob/main/docs/operations/pages.md';

const key = (websiteId: string) => `vizoalica.install.path.${websiteId}`;

// The choice is only a convenience for this browser, so storage may be blocked or empty.
export function readPath(websiteId: string): InstallPath | undefined {
  try {
    const value = window.localStorage.getItem(key(websiteId));
    return value === 'github' || value === 'snippet' ? value : undefined;
  } catch {
    return undefined;
  }
}

export function writePath(websiteId: string, path: InstallPath): void {
  try {
    window.localStorage.setItem(key(websiteId), path);
  } catch {
    // Not remembering the choice is acceptable.
  }
}

export interface Modes {
  staticMode: StaticInstallation | undefined;
  dynamicMode: DynamicInstallation | undefined;
  /** The static snippet text, falling back to the legacy field, then to an explanation. */
  staticCode: string;
}

export function modesOf(snippet: Integration): Modes {
  const staticMode = snippet.modes?.find((item) => item.id === 'static') as
    StaticInstallation | undefined;
  const dynamicMode = snippet.modes?.find((item) => item.id === 'dynamic') as
    DynamicInstallation | undefined;
  return {
    staticMode,
    dynamicMode,
    staticCode:
      staticMode?.snippet ??
      snippet.html ??
      'Snippet unavailable. Restart the local API with the current Vizoalica version.'
  };
}
