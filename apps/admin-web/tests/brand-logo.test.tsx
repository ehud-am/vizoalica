// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { BrandLogo } from '../src/components/BrandLogo.js';

afterEach(cleanup);

describe('BrandLogo', () => {
  it('selects the full lockup for the resolved theme', () => {
    const { rerender } = render(<BrandLogo theme="light" />);
    expect(screen.getByTestId('brand-logo').getAttribute('src')).toBe(
      '/brand/vizoalica-lockup-light.svg'
    );
    rerender(<BrandLogo theme="dark" />);
    expect(screen.getByTestId('brand-logo').getAttribute('src')).toBe(
      '/brand/vizoalica-lockup-dark.svg'
    );
  });

  it('renders a decorative compact mark', () => {
    render(<BrandLogo theme="dark" compact />);
    const logo = screen.getByTestId('brand-logo');
    expect(logo.getAttribute('src')).toBe('/brand/vizoalica-mark.svg');
    expect(logo.getAttribute('alt')).toBe('');
  });
});
