// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { AppFooter } from '../src/components/AppFooter.js';
import { FOOTER_LINKS } from '../src/footer-links.js';

afterEach(cleanup);

describe('AppFooter', () => {
  it('is one line with exactly three items: the name, the website and GitHub', () => {
    render(<AppFooter />);
    const footer = screen.getByRole('contentinfo');
    expect(footer.querySelectorAll('p')).toHaveLength(1);
    expect(footer.textContent).toBe('Vizoalica·vizoalica.dev·GitHub');
    expect(
      within(footer)
        .getAllByRole('link')
        .map((link) => link.textContent)
    ).toEqual(['vizoalica.dev', 'GitHub']);
  });

  it('carries no tagline, link groups, legal line or version', () => {
    render(<AppFooter />);
    const footer = screen.getByRole('contentinfo');
    expect(within(footer).queryByRole('navigation')).toBeNull();
    expect(within(footer).queryByRole('heading')).toBeNull();
    expect(footer.textContent).not.toMatch(/©|Version|Privacy-first/);
  });

  it('points at the website and the repository', () => {
    render(<AppFooter />);
    expect(screen.getByRole('link', { name: /^vizoalica\.dev:/ }).getAttribute('href')).toBe(
      'https://vizoalica.dev'
    );
    expect(screen.getByRole('link', { name: /^GitHub:/ }).getAttribute('href')).toBe(
      'https://github.com/ehud-am/vizoalica'
    );
  });

  it('opens every link in a new tab without leaking the opener, with a distinct name', () => {
    render(<AppFooter />);
    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(FOOTER_LINKS.length);
    for (const link of links) {
      expect(link.getAttribute('target')).toBe('_blank');
      expect(link.getAttribute('rel')).toBe('noopener noreferrer');
      expect(link.getAttribute('aria-label')).toMatch(/\(opens in a new tab\)$/);
    }
    expect(new Set(links.map((link) => link.getAttribute('aria-label'))).size).toBe(links.length);
  });

  it('hides the separators from assistive technology', () => {
    render(<AppFooter />);
    const separators = screen.getByRole('contentinfo').querySelectorAll('[aria-hidden="true"]');
    expect(separators).toHaveLength(2);
  });
});
