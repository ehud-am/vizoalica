// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ConnectionNotice, rememberConnectNotice } from '../src/components/ConnectionNotice.js';

afterEach(() => {
  cleanup();
  sessionStorage.clear();
});

describe('ConnectionNotice', () => {
  it('shows nothing when no notice was remembered', () => {
    const { container } = render(<ConnectionNotice />);
    expect(container.textContent).toBe('');
  });

  it('shows and then clears an administrator_secret_used notice', () => {
    rememberConnectNotice('administrator_secret_used');
    render(<ConnectionNotice />);
    expect(screen.getByText(/administrator secret, not an access key/)).toBeTruthy();
    expect(sessionStorage.getItem('vizoalica_connect_notice')).toBeNull();
  });

  it('shows a role_corrected notice', () => {
    rememberConnectNotice('role_corrected');
    render(<ConnectionNotice />);
    expect(screen.getByText(/different role than you chose/)).toBeTruthy();
  });

  it('remembers nothing for an undefined notice', () => {
    rememberConnectNotice(undefined);
    expect(sessionStorage.getItem('vizoalica_connect_notice')).toBeNull();
  });

  it('shows nothing for an unrecognized notice value', () => {
    sessionStorage.setItem('vizoalica_connect_notice', 'something_else');
    const { container } = render(<ConnectionNotice />);
    expect(container.textContent).toBe('');
  });
});
