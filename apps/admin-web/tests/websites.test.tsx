// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { IntegrationSnippet } from '../src/components/IntegrationSnippet.js';
import { OperationalStatus } from '../src/components/OperationalStatus.js';
import { WebsiteForm } from '../src/components/WebsiteForm.js';
import { WebsiteList } from '../src/components/WebsiteList.js';
import { primaryIntegration } from './fixtures/console.js';

afterEach(cleanup);

describe('website lifecycle UI', () => {
  it('distinguishes active, disabled, and deleted websites', () => {
    const websites = ['active', 'disabled', 'deleted'].map((status, index) => ({
      id: `${index}`,
      projectId: 'p1',
      name: status,
      publicSourceKey: 'public',
      allowedOrigins: ['https://site.test'],
      status: status as 'active' | 'disabled' | 'deleted'
    }));
    const html = renderToStaticMarkup(
      <WebsiteList websites={websites} selectedId="0" onSelect={() => undefined} />
    );
    expect(html).toContain('status active');
    expect(html).toContain('status disabled');
    expect(html).toContain('status deleted');
  });

  it('starts website creation with an empty required project control', async () => {
    const submit = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(
      <WebsiteForm
        projects={[
          { id: 'p1', name: 'Current' },
          { id: 'p2', name: 'Target' }
        ]}
        onSubmit={submit}
      />
    );
    const controls = screen
      .getByRole('form', { name: 'Add website' })
      .querySelectorAll('select, input, textarea');
    const project = screen.getByRole('combobox', { name: 'Project' }) as HTMLSelectElement;
    expect(controls[0]).toBe(project);
    expect(project.required).toBe(true);
    expect(project.value).toBe('');

    await user.selectOptions(project, 'p2');
    await user.type(screen.getByRole('textbox', { name: 'Website name' }), 'Marketing');
    await user.type(screen.getByRole('textbox', { name: 'Allowed origins' }), 'https://site.test');
    await user.click(screen.getByRole('button', { name: 'Add website' }));
    await waitFor(() =>
      expect(submit).toHaveBeenCalledWith({
        projectId: 'p2',
        name: 'Marketing',
        allowedOrigins: ['https://site.test']
      })
    );
    expect(project.value).toBe('');
  });

  it('does not expose project ownership as editable in edit mode and retains failed drafts', async () => {
    const submit = vi.fn().mockRejectedValue(new Error('stale project'));
    const user = userEvent.setup();
    render(
      <WebsiteForm
        initialName="Docs"
        initialOrigins={['https://docs.test']}
        submitLabel="Save changes"
        onSubmit={submit}
      />
    );
    expect(screen.queryByRole('combobox', { name: 'Project' })).toBeNull();
    await user.clear(screen.getByRole('textbox', { name: 'Website name' }));
    await user.type(screen.getByRole('textbox', { name: 'Website name' }), 'Docs retained');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(submit).toHaveBeenCalled());
    expect((screen.getByRole('textbox', { name: 'Website name' }) as HTMLInputElement).value).toBe(
      'Docs retained'
    );
  });
  it('shows safe integration guidance and health distinctions', () => {
    const snippet = renderToStaticMarkup(<IntegrationSnippet snippet={primaryIntegration} />);
    expect(snippet).toContain('public-key');
    expect(snippet).not.toMatch(/admin-secret|Bearer|issued JWT/i);
    const status = renderToStaticMarkup(
      <OperationalStatus
        status={{ collection: 'disabled', aggregation: 'processing', dataAccess: 'unavailable' }}
      />
    );
    expect(status).toContain('disabled');
    expect(status).toContain('processing');
    expect(status).toContain('unavailable');
  });

  it('offers exactly two accessible installation modes with isolated copy actions', async () => {
    const user = userEvent.setup();
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) }
    });
    render(<IntegrationSnippet snippet={primaryIntegration} />);
    const choices = screen.getAllByRole('radio');
    expect(choices).toHaveLength(2);
    expect(screen.getByRole('radio', { name: /Static snippet/ }).getAttribute('checked')).not.toBe(
      null
    );
    await user.click(screen.getByRole('button', { name: 'Copy static snippet' }));
    expect(navigator.clipboard.writeText).toHaveBeenLastCalledWith(
      primaryIntegration.modes[0].snippet
    );

    await user.click(screen.getByRole('radio', { name: /Dynamic configuration/ }));
    expect(screen.getByRole('region', { name: 'Dynamic loader code' }).textContent).toBe(
      primaryIntegration.modes[1].snippet
    );
    expect(screen.getByText(/remove or disable the other installation path/i)).toBeTruthy();
    expect(
      screen.getByRole('region', { name: 'Starter GitHub Actions workflow' }).textContent
    ).toContain('uses: ehud-am/vizoalica/.github/workflows/deploy-vizoalica-pages.yml@v0.5.3');
    expect(
      screen.getByRole('region', { name: 'Required GitHub repository variables' }).textContent
    ).toContain('VIZOALICA_SOURCE_ID');
    expect(screen.getByRole('region', { name: 'gh CLI setup commands' }).textContent).toContain(
      'gh secret set CF_API_TOKEN'
    );
    await user.click(screen.getByRole('button', { name: 'Copy dynamic snippet' }));
    expect(navigator.clipboard.writeText).toHaveBeenLastCalledWith(
      primaryIntegration.modes[1].snippet
    );
  });
});
