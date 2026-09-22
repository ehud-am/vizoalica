// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppFooter } from '../src/components/AppFooter.js';
import { PROJECT_LINKS, VIZOALICA_LINKS } from '../src/footer-links.js';

beforeEach(() => vi.stubGlobal('__VIZOALICA_VERSION__', '0.6.3'));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('AppFooter', () => {
  it('shows the brand mark, the name, and the tagline', () => {
    render(<AppFooter />);
    const footer = screen.getByRole('contentinfo');
    expect(within(footer).getByTestId('footer-mark').getAttribute('src')).toBe(
      '/brand/vizoalica-mark.svg'
    );
    expect(within(footer).getByText('Vizoalica', { selector: 'p' })).toBeTruthy();
    expect(
      within(footer).getByText('Privacy-first analytics that runs in your own Cloudflare account.')
    ).toBeTruthy();
  });

  it('has a labeled Vizoalica group with the website, documentation, guide, and privacy pages', () => {
    render(<AppFooter />);
    const group = screen.getByRole('navigation', { name: 'Vizoalica' });
    expect(within(group).getByRole('heading', { name: 'Vizoalica' })).toBeTruthy();
    const links = within(group).getAllByRole('link');
    expect(links.map((link) => link.textContent)).toEqual([
      'Website',
      'Documentation',
      'Get started',
      'Privacy'
    ]);
    expect(links[0]!.getAttribute('href')).toBe('https://vizoalica.dev');
  });

  it('has a labeled Project group pointing at the repository', () => {
    render(<AppFooter />);
    const group = screen.getByRole('navigation', { name: 'Project' });
    const links = within(group).getAllByRole('link');
    expect(links.map((link) => link.textContent)).toEqual([
      'GitHub',
      'npm',
      'Discussions',
      'Issues',
      'Release notes',
      'License'
    ]);
    expect(links[0]!.getAttribute('href')).toBe('https://github.com/ehud-am/vizoalica');
    expect(links[1]!.getAttribute('href')).toBe('https://www.npmjs.com/package/vizoalica');
  });

  it('opens every link in a new tab without leaking the opener, with a distinct name', () => {
    render(<AppFooter />);
    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(VIZOALICA_LINKS.length + PROJECT_LINKS.length);
    for (const link of links) {
      expect(link.getAttribute('target')).toBe('_blank');
      expect(link.getAttribute('rel')).toBe('noopener noreferrer');
      expect(link.getAttribute('href')).toMatch(/^https:\/\//);
    }
    const names = links.map((link) => link.getAttribute('aria-label'));
    expect(new Set(names).size).toBe(names.length);
  });

  it('ends with the year, the product, and the version', () => {
    render(<AppFooter />);
    expect(screen.getByText(`© ${new Date().getFullYear()} Vizoalica`)).toBeTruthy();
    expect(screen.getByText('Version 0.6.3')).toBeTruthy();
  });

  it('says so when the version is unavailable', () => {
    vi.stubGlobal('__VIZOALICA_VERSION__', 'weird');
    render(<AppFooter />);
    expect(screen.getByText('Version unavailable')).toBeTruthy();
  });

  it('makes no request when it renders', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    render(<AppFooter />);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
