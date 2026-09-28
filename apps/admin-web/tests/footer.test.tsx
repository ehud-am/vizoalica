// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { AppFooter } from '../src/components/AppFooter.js';
import { FOOTER_LINKS } from '../src/footer-links.js';

afterEach(cleanup);

describe('AppFooter', () => {
  it('is one line: the name, the website, GitHub and a feedback link', () => {
    render(<AppFooter />);
    const footer = screen.getByRole('contentinfo');
    expect(footer.querySelectorAll('p')).toHaveLength(1);
    expect(footer.textContent).toBe('Vizoalica·vizoalica.dev·GitHub·Send feedback');
    expect(
      within(footer)
        .getAllByRole('link')
        .map((link) => link.textContent)
    ).toEqual(['vizoalica.dev', 'GitHub', 'Send feedback']);
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

  it('sends feedback to a prefilled Ideas discussion with the version and screen', () => {
    render(<AppFooter version="0.7.4" page="analytics/pages" />);
    const href = screen.getByRole('link', { name: /^Send feedback:/ }).getAttribute('href') ?? '';
    const url = new URL(href);
    expect(url.origin + url.pathname).toBe('https://github.com/ehud-am/vizoalica/discussions/new');
    expect(url.searchParams.get('category')).toBe('ideas');
    expect(url.searchParams.get('title')).toBe('Alpha feedback: ');
    expect(url.searchParams.get('body')).toContain('Console version: 0.7.4');
    expect(url.searchParams.get('body')).toContain('Screen: analytics/pages');
  });

  it('opens every link in a new tab without leaking the opener, with a distinct name', () => {
    render(<AppFooter />);
    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(FOOTER_LINKS.length + 1);
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
    expect(separators).toHaveLength(3);
  });
});
