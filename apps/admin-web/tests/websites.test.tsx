// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OperationalStatus } from '../src/components/OperationalStatus.js';
import { WebsiteCard } from '../src/components/WebsiteCard.js';
import { WebsiteForm, isExactOrigin } from '../src/components/WebsiteForm.js';
import { site } from './fixtures/api.js';

afterEach(cleanup);

describe('website card', () => {
  it('distinguishes active and disabled websites and is a single link to the website page', () => {
    const active = renderToStaticMarkup(<WebsiteCard website={site('a', 'p1', 'Alpha')} />);
    const disabled = renderToStaticMarkup(
      <WebsiteCard website={site('b', 'p1', 'Beta', { status: 'disabled' })} />
    );
    expect(active).toContain('status active');
    expect(disabled).toContain('status disabled');
    expect(active).toContain('href="#/manage/websites/a"');
    expect(active.match(/<a /g)).toHaveLength(1);
  });

  it('shows the first origin with a count of the others, and copes with none', () => {
    const many = renderToStaticMarkup(
      <WebsiteCard
        website={site('a', 'p1', 'Alpha', {
          allowedOrigins: ['https://a.test', 'https://www.a.test', 'https://b.test']
        })}
      />
    );
    expect(many).toContain('https://a.test');
    expect(many).toContain('+2 more');
    const none = renderToStaticMarkup(
      <WebsiteCard website={site('a', 'p1', 'Alpha', { allowedOrigins: [] })} />
    );
    expect(none).toContain('No origin');
  });
});

describe('website form', () => {
  const projects = [
    { id: 'p1', name: 'Current' },
    { id: 'p2', name: 'Target' }
  ];

  it('starts creation with an empty required project control', async () => {
    const submit = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<WebsiteForm projects={projects} onSubmit={submit} />);
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

  it('does not expose the project in edit mode, keeps failed drafts, and shows why', async () => {
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
    expect(await screen.findByText(/Website could not be saved/)).toBeTruthy();
  });

  it('reports unsaved changes and keeps Save unavailable until something changed', async () => {
    const user = userEvent.setup();
    const changes: boolean[] = [];
    render(
      <WebsiteForm
        initialName="Docs"
        initialOrigins={['https://docs.test']}
        submitLabel="Save changes"
        onSubmit={async () => undefined}
        onDirtyChange={(dirty) => changes.push(dirty)}
      />
    );
    const save = screen.getByRole('button', { name: 'Save changes' }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    expect(changes.at(-1)).toBe(false);
    await user.type(screen.getByRole('textbox', { name: 'Website name' }), '!');
    expect(save.disabled).toBe(false);
    expect(changes.at(-1)).toBe(true);
    await user.type(screen.getByRole('textbox', { name: 'Website name' }), '{Backspace}');
    expect(save.disabled).toBe(true);
    expect(changes.at(-1)).toBe(false);
    // Extra whitespace between origins is not a change.
    await user.type(screen.getByRole('textbox', { name: 'Allowed origins' }), '\n\n');
    expect(save.disabled).toBe(true);
  });

  it('reports each field problem next to the field and sends nothing', async () => {
    const user = userEvent.setup();
    const submit = vi.fn();
    render(<WebsiteForm projects={projects} onSubmit={submit} />);
    await user.click(screen.getByRole('button', { name: 'Add website' }));
    expect(await screen.findByText('Choose the project this website belongs to.')).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole('combobox', { name: 'Project' }));
    await user.selectOptions(screen.getByRole('combobox', { name: 'Project' }), 'p1');
    await user.click(screen.getByRole('button', { name: 'Add website' }));
    expect(await screen.findByText('Enter a name for this website.')).toBeTruthy();
    expect(screen.getByRole('textbox', { name: 'Website name' }).getAttribute('aria-invalid')).toBe(
      'true'
    );
    await user.type(screen.getByRole('textbox', { name: 'Website name' }), 'x'.repeat(121));
    await user.click(screen.getByRole('button', { name: 'Add website' }));
    expect(await screen.findByText('Use 120 characters or fewer.')).toBeTruthy();
    await user.clear(screen.getByRole('textbox', { name: 'Website name' }));
    await user.type(screen.getByRole('textbox', { name: 'Website name' }), 'Fine');
    await user.click(screen.getByRole('button', { name: 'Add website' }));
    expect(await screen.findByText('Enter at least one allowed origin.')).toBeTruthy();
    await user.type(
      screen.getByRole('textbox', { name: 'Allowed origins' }),
      'https://ok.test/path'
    );
    await user.click(screen.getByRole('button', { name: 'Add website' }));
    expect(await screen.findByText(/is not an exact origin/)).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Allowed origins' }));
    expect(submit).not.toHaveBeenCalled();
  });

  it('focuses the first field when asked', () => {
    render(
      <WebsiteForm
        initialName="Docs"
        submitLabel="Save changes"
        autoFocus
        onSubmit={async () => undefined}
      />
    );
    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Website name' }));
    cleanup();
    render(<WebsiteForm projects={projects} autoFocus onSubmit={async () => undefined} />);
    expect(document.activeElement).toBe(screen.getByRole('combobox', { name: 'Project' }));
  });

  it('accepts only exact http and https origins', () => {
    for (const good of ['https://a.test', 'http://localhost:3000', 'https://a.test:8443'])
      expect(isExactOrigin(good), good).toBe(true);
    for (const bad of [
      'a.test',
      'https://a.test/',
      'https://a.test/x',
      'ftp://a.test',
      'https://A.test',
      'javascript:alert(1)',
      ''
    ])
      expect(isExactOrigin(bad), bad).toBe(false);
  });
});

describe('operational status', () => {
  it('shows health distinctions, in its own card or inline', () => {
    const status = {
      collection: 'disabled',
      aggregation: 'processing',
      dataAccess: 'unavailable'
    } as const;
    const card = renderToStaticMarkup(<OperationalStatus status={status} />);
    expect(card).toContain('disabled');
    expect(card).toContain('processing');
    expect(card).toContain('unavailable');
    expect(card).toContain('detail-card');
    const bare = renderToStaticMarkup(<OperationalStatus status={status} bare />);
    expect(bare).toContain('status-block');
    expect(bare).not.toContain('detail-card');
  });
});
