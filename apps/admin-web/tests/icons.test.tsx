import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  AlertTriangleIcon,
  AnalyticsIcon,
  CopyIcon,
  LockIcon,
  MoonIcon,
  RefreshIcon,
  SunIcon,
  WebsitesIcon
} from '../src/components/Icons.js';

describe('console icon vocabulary', () => {
  it('uses one decorative, focus-free SVG contract', () => {
    for (const Icon of [
      AnalyticsIcon,
      WebsitesIcon,
      LockIcon,
      RefreshIcon,
      SunIcon,
      MoonIcon,
      CopyIcon,
      AlertTriangleIcon
    ]) {
      const markup = renderToStaticMarkup(<Icon />);
      expect(markup).toContain('viewBox="0 0 24 24"');
      expect(markup).toContain('stroke="currentColor"');
      expect(markup).toContain('aria-hidden="true"');
      expect(markup).toContain('focusable="false"');
      expect(markup).not.toContain('<text');
    }
  });

  it('supports the approved shared size scale', () => {
    expect(renderToStaticMarkup(<AnalyticsIcon size={16} />)).toContain('width="16"');
    expect(renderToStaticMarkup(<AnalyticsIcon size={20} />)).toContain('width="20"');
    expect(renderToStaticMarkup(<AnalyticsIcon size={24} />)).toContain('width="24"');
  });
});
