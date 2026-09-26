// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OperationalStatus } from '../src/components/OperationalStatus.js';
import { WebsiteCard } from '../src/components/WebsiteCard.js';
import { WebsiteForm } from '../src/components/WebsiteForm.js';
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
  const address = () => screen.getByRole('textbox', { name: 'Website address' });
  const name = () => screen.getByRole('textbox', { name: /Website name/ });

  it('asks for an address first and shows the project as text, not a choice', () => {
    render(<WebsiteForm projectName="Marketing" onSubmit={vi.fn()} />);
    const form = screen.getByRole('form', { name: 'Add website' });
    expect(form.querySelectorAll('select')).toHaveLength(0);
    expect(form.querySelector('.form-project')!.textContent).toBe('Project: Marketing');
    // The address comes first; the name is optional.
    expect(form.querySelectorAll('input, textarea')[0]).toBe(address());
    expect(name().hasAttribute('required')).toBe(false);
    expect(screen.getByText('(optional)')).toBeTruthy();
  });

  it('tidies a pasted address into an exact origin, shows it, and names the website after its domain', async () => {
    const submit = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<WebsiteForm projectName="Marketing" onSubmit={submit} />);
    await user.type(address(), 'Example.com/pricing?x=1/');
    // Before anything is saved, the person sees exactly what will be.
    const preview = document.querySelector('.origin-preview')!;
    expect(preview.textContent).toContain('https://example.com');
    expect(preview.textContent).toContain('https://www.example.com');
    expect(name().getAttribute('placeholder')).toBe('example.com');
    await user.click(screen.getByRole('button', { name: 'Add website' }));
    await waitFor(() =>
      expect(submit).toHaveBeenCalledWith({
        name: 'example.com',
        allowedOrigins: ['https://example.com', 'https://www.example.com']
      })
    );
    // The form is ready for the next one.
    expect((address() as HTMLTextAreaElement).value).toBe('');
  });

  it('keeps a typed name, and lets the www counterpart be switched off', async () => {
    const submit = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<WebsiteForm projectName="Marketing" onSubmit={submit} />);
    await user.type(address(), 'https://example.com');
    const also = screen.getByRole('checkbox', { name: /Also allow/ }) as HTMLInputElement;
    expect(also.checked).toBe(true);
    expect(also.closest('label')!.textContent).toContain('https://www.example.com');
    await user.click(also);
    await user.type(name(), 'Marketing site');
    await user.click(screen.getByRole('button', { name: 'Add website' }));
    await waitFor(() =>
      expect(submit).toHaveBeenCalledWith({
        name: 'Marketing site',
        allowedOrigins: ['https://example.com']
      })
    );
  });

  it('offers the other spelling in both directions, and only for an ordinary domain', async () => {
    const user = userEvent.setup();
    render(<WebsiteForm projectName="P" onSubmit={vi.fn()} />);
    await user.type(address(), 'www.example.com');
    expect(
      screen.getByRole('checkbox', { name: /Also allow/ }).closest('label')!.textContent
    ).toContain('https://example.com');
    await user.clear(address());
    await user.type(address(), 'blog.example.com');
    expect(screen.queryByRole('checkbox')).toBeNull();
    await user.clear(address());
    await user.type(address(), 'localhost:3000');
    expect(screen.queryByRole('checkbox')).toBeNull();
    // With several addresses typed there is nothing to guess.
    await user.clear(address());
    await user.type(address(), 'a.com b.com');
    expect(screen.queryByRole('checkbox')).toBeNull();
  });

  it('accepts several addresses separated by spaces, lines or commas, without repeats', async () => {
    const submit = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<WebsiteForm projectName="P" onSubmit={submit} />);
    await user.type(address(), 'a.test, https://a.test/x{Enter}b.test');
    await user.click(screen.getByRole('button', { name: 'Add website' }));
    await waitFor(() =>
      expect(submit).toHaveBeenCalledWith({
        name: 'a.test',
        allowedOrigins: ['https://a.test', 'https://b.test']
      })
    );
  });

  it('says what to type instead when an address cannot be used, and sends nothing', async () => {
    const user = userEvent.setup();
    const submit = vi.fn();
    render(<WebsiteForm projectName="P" onSubmit={submit} />);
    await user.click(screen.getByRole('button', { name: 'Add website' }));
    expect(await screen.findByText('Enter your website’s address.')).toBeTruthy();
    expect(document.activeElement).toBe(address());
    await user.type(address(), 'ftp://files.test');
    await user.click(screen.getByRole('button', { name: 'Add website' }));
    expect(
      await screen.findByText(/cannot be measured\. Use the address people open/)
    ).toBeTruthy();
    expect(address().getAttribute('aria-invalid')).toBe('true');
    await user.clear(address());
    await user.type(address(), 'ok.test');
    await user.type(name(), 'x'.repeat(121));
    await user.click(screen.getByRole('button', { name: 'Add website' }));
    expect(await screen.findByText('Use 120 characters or fewer.')).toBeTruthy();
    expect(document.activeElement).toBe(name());
    await user.clear(address());
    await user.type(
      address(),
      Array.from({ length: 11 }, (_, index) => `s${index}.test`).join(' ')
    );
    await user.clear(name());
    await user.click(screen.getByRole('button', { name: 'Add website' }));
    expect(await screen.findByText('Use 10 addresses or fewer.')).toBeTruthy();
    expect(submit).not.toHaveBeenCalled();
  });

  it('warns, without blocking, that http is only for testing', async () => {
    const user = userEvent.setup();
    render(<WebsiteForm projectName="P" onSubmit={vi.fn()} />);
    await user.type(address(), 'http://example.com');
    expect(screen.getByText(/uses http\. Signed tokens need https/)).toBeTruthy();
    await user.clear(address());
    await user.type(address(), 'http://localhost:3000');
    expect(screen.queryByText(/uses http/)).toBeNull();
  });

  it('keeps entries and explains when saving fails', async () => {
    const submit = vi.fn().mockRejectedValue(new Error('offline'));
    const user = userEvent.setup();
    render(<WebsiteForm projectName="P" onSubmit={submit} />);
    await user.type(address(), 'example.com');
    await user.click(screen.getByRole('button', { name: 'Add website' }));
    expect(await screen.findByText(/Website could not be saved/)).toBeTruthy();
    expect((address() as HTMLTextAreaElement).value).toBe('example.com');
  });

  it('edits with the name first and the allowed origins as a list, keeping failed drafts', async () => {
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
    const form = screen.getByRole('form', { name: 'Edit website' });
    expect(form.querySelectorAll('input, textarea')[0]).toBe(name());
    expect(form.querySelector('.form-project')).toBeNull();
    expect(screen.queryByRole('checkbox')).toBeNull();
    await user.clear(name());
    await user.type(name(), 'Docs retained');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(submit).toHaveBeenCalled());
    expect((name() as HTMLInputElement).value).toBe('Docs retained');
    expect(await screen.findByText(/Website could not be saved/)).toBeTruthy();
  });

  it('tidies pasted origins when editing too', async () => {
    const submit = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(
      <WebsiteForm
        initialName="Docs"
        initialOrigins={['https://docs.test']}
        submitLabel="Save changes"
        onSubmit={submit}
      />
    );
    await user.clear(screen.getByRole('textbox', { name: 'Allowed origins' }));
    await user.type(screen.getByRole('textbox', { name: 'Allowed origins' }), 'Other.test/x');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() =>
      expect(submit).toHaveBeenCalledWith({ name: 'Docs', allowedOrigins: ['https://other.test'] })
    );
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
    await user.type(name(), '!');
    expect(save.disabled).toBe(false);
    expect(changes.at(-1)).toBe(true);
    await user.type(name(), '{Backspace}');
    expect(save.disabled).toBe(true);
    expect(changes.at(-1)).toBe(false);
    // Extra whitespace, or the same origin spelled another way, is not a change.
    await user.type(screen.getByRole('textbox', { name: 'Allowed origins' }), '\n\n');
    expect(save.disabled).toBe(true);
  });

  it('reports a draft as unsaved once an address is typed', async () => {
    const user = userEvent.setup();
    const changes: boolean[] = [];
    render(
      <WebsiteForm
        projectName="P"
        onSubmit={vi.fn()}
        onDirtyChange={(dirty) => changes.push(dirty)}
      />
    );
    expect(changes.at(-1)).toBe(false);
    await user.type(address(), 'a');
    expect(changes.at(-1)).toBe(true);
  });

  it('focuses the first field when asked: the address to add, the name to edit', () => {
    render(
      <WebsiteForm
        initialName="Docs"
        submitLabel="Save changes"
        autoFocus
        onSubmit={async () => undefined}
      />
    );
    expect(document.activeElement).toBe(name());
    cleanup();
    render(<WebsiteForm projectName="P" autoFocus onSubmit={async () => undefined} />);
    expect(document.activeElement).toBe(address());
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
