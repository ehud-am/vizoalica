// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { BrandLogo } from '../src/components/BrandLogo.js';
import { TimeRangeSelector } from '../src/components/TimeRangeSelector.js';
import { presetToRange } from '../src/time-range.js';

afterEach(cleanup);

describe('stable responsive component state', () => {
  it('uses one logo element whose asset updates in place', () => {
    const { rerender } = render(<BrandLogo theme="light" />);
    const node = screen.getByTestId('brand-logo');
    rerender(<BrandLogo theme="dark" />);
    expect(screen.getByTestId('brand-logo')).toBe(node);
  });

  it('renders one CSS-adapted range selector without viewport branching', () => {
    render(<TimeRangeSelector applied={presetToRange('7d')} onApply={() => undefined} />);
    expect(screen.getAllByRole('button', { name: /Last 7 days/ })).toHaveLength(1);
  });
});
