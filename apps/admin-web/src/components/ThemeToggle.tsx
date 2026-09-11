import type { Theme } from '../theme.js';
import { MoonIcon, SunIcon } from './Icons.js';

export function ThemeToggle({
  theme,
  saving,
  saveError,
  onChange
}: {
  theme: Theme;
  saving: boolean;
  saveError: boolean;
  onChange: (theme: Theme) => void;
}) {
  return (
    <div>
      <div className="theme-toggle" role="group" aria-label="Theme">
        <button type="button" aria-pressed={theme === 'light'} onClick={() => onChange('light')}>
          <SunIcon size={16} />
          Light
        </button>
        <button type="button" aria-pressed={theme === 'dark'} onClick={() => onChange('dark')}>
          <MoonIcon size={16} />
          Dark
        </button>
      </div>
      <p className="theme-toggle-status" role="status" aria-live="polite">
        {saving ? 'Saving theme…' : saveError ? 'Theme applied, but could not be saved.' : ''}
      </p>
    </div>
  );
}
