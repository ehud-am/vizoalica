// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App.js';
import {
  consoleProjects,
  duplicateNameProject,
  makeOverview,
  primaryProject
} from './fixtures/console.js';

const api = vi.hoisted(() => ({
  bootstrapSession: vi.fn(),
  listProjects: vi.fn(),
  createProject: vi.fn(),
  deleteProject: vi.fn(),
  listWebsites: vi.fn(),
  getAnalyticsOverview: vi.fn(),
  getThemePreference: vi.fn(),
  putThemePreference: vi.fn()
}));

vi.mock('../src/api/local-operations.js', async (load) => ({ ...(await load()), ...api }));

beforeEach(() => {
  window.location.hash = '#/manage/projects';
  api.bootstrapSession.mockResolvedValue(undefined);
  api.listProjects.mockResolvedValue(consoleProjects);
  api.createProject.mockResolvedValue({ id: 'project-3', name: 'Marketing', websiteCount: 0 });
  api.deleteProject.mockResolvedValue({ status: 'deleted', audit: 'recorded' });
  api.listWebsites.mockResolvedValue([]);
  api.getAnalyticsOverview.mockResolvedValue(makeOverview());
  api.getThemePreference.mockResolvedValue({ theme: null });
  api.putThemePreference.mockResolvedValue({ theme: 'light' });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const scopeProject = () =>
  (
    within(screen.getByRole('region', { name: 'Scope' })).getByLabelText(
      'Project'
    ) as HTMLSelectElement
  ).value;

describe('Manage > Projects', () => {
  it('identifies duplicate project names by stable ID and shows no project picker of its own', async () => {
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Projects' })).toBeTruthy();
    expect(screen.getByText(primaryProject.id)).toBeTruthy();
    expect(screen.getByText(duplicateNameProject.id)).toBeTruthy();
    expect(screen.getAllByText('Developer Tools')).toHaveLength(2);
    expect(screen.getByRole('link', { name: 'Projects' }).getAttribute('aria-current')).toBe(
      'page'
    );
    // Projects is not scope-bound, so the shell hides the project and website controls.
    expect(screen.queryByLabelText('Website')).toBeNull();
    expect(screen.queryByRole('button', { name: /^Select / })).toBeNull();
  });

  it('opens a project in Websites or Analytics and makes it the current scope', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(
      await screen.findByRole('link', {
        name: `Manage websites in ${duplicateNameProject.name} (${duplicateNameProject.id})`
      })
    );
    await waitFor(() => expect(api.listWebsites).toHaveBeenCalledWith(duplicateNameProject.id));
    expect(document.querySelector('main')?.getAttribute('data-route')).toBe('manage/websites');
    expect(scopeProject()).toBe(duplicateNameProject.id);

    await user.click(screen.getByRole('link', { name: 'Projects' }));
    await user.click(
      screen.getByRole('link', {
        name: `View analytics for ${duplicateNameProject.name} (${duplicateNameProject.id})`
      })
    );
    await waitFor(() =>
      expect(api.getAnalyticsOverview).toHaveBeenCalledWith(
        duplicateNameProject.id,
        undefined,
        expect.any(String),
        expect.any(String),
        expect.any(AbortSignal)
      )
    );
    expect(document.querySelector('main')?.getAttribute('data-route')).toBe('analytics/overview');
  });

  it('creates a project with an inline form and makes it the current scope', async () => {
    const user = userEvent.setup();
    const created = { id: 'project-3', name: 'Marketing', websiteCount: 0 };
    api.listProjects
      .mockResolvedValueOnce(consoleProjects)
      .mockResolvedValueOnce([...consoleProjects, created]);
    render(<App />);
    await user.type(await screen.findByRole('textbox', { name: 'Project name' }), created.name);
    await user.click(screen.getByRole('button', { name: 'Create project' }));

    await waitFor(() => expect(api.createProject).toHaveBeenCalledWith(created.name));
    expect(await screen.findByText(`Project ${created.name} created.`)).toBeTruthy();
    await user.click(screen.getByRole('link', { name: 'Websites' }));
    expect(scopeProject()).toBe(created.id);
  });

  it('reports a failed create and a failed refresh without changing the list', async () => {
    const user = userEvent.setup();
    api.createProject.mockRejectedValueOnce(new Error('offline'));
    render(<App />);
    await user.type(await screen.findByRole('textbox', { name: 'Project name' }), 'Marketing');
    await user.click(screen.getByRole('button', { name: 'Create project' }));
    expect(await screen.findByText(/The project could not be created/)).toBeTruthy();
    api.listProjects.mockRejectedValueOnce(new Error('offline'));
    await user.click(screen.getByRole('button', { name: 'Refresh projects' }));
    expect(await screen.findByText(/Projects could not be refreshed/)).toBeTruthy();
    api.listProjects.mockResolvedValueOnce(consoleProjects);
    await user.click(screen.getByRole('button', { name: 'Refresh projects' }));
    expect(await screen.findByText('Project list refreshed.')).toBeTruthy();
  });

  it('reconciles the scope when a refresh drops the current project', async () => {
    const user = userEvent.setup();
    api.listProjects
      .mockResolvedValueOnce(consoleProjects)
      .mockResolvedValueOnce([duplicateNameProject]);
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Refresh projects' }));
    await screen.findByText('Project list refreshed.');
    await user.click(screen.getByRole('link', { name: 'Websites' }));
    expect(scopeProject()).toBe(duplicateNameProject.id);
    expect(await screen.findByText(/previous project is no longer available/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByText(/previous project is no longer available/)).toBeNull();
  });
});

describe('Manage > Projects danger zone', () => {
  it('deletes a project only after its name is typed, then lists it as deleted', async () => {
    const user = userEvent.setup();
    api.listProjects
      .mockResolvedValueOnce([primaryProject])
      .mockResolvedValueOnce([{ ...primaryProject, status: 'deleted' as const }]);
    const nativeConfirm = vi.spyOn(window, 'confirm');
    render(<App />);
    await user.click(await screen.findByRole('button', { name: /^Delete project/ }));
    const dialog = screen.getByRole('alertdialog', {
      name: `Delete project ${primaryProject.name}?`
    });
    const confirm = within(dialog).getByRole('button', {
      name: 'Delete project'
    }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    await user.type(within(dialog).getByLabelText(/Type/), 'Developer');
    expect(confirm.disabled).toBe(true);
    await user.type(within(dialog).getByLabelText(/Type/), ' Tools');
    expect(confirm.disabled).toBe(false);
    await user.click(confirm);
    await waitFor(() => expect(api.deleteProject).toHaveBeenCalledWith(primaryProject.id));
    expect(await screen.findByText(/Project Developer Tools deleted/)).toBeTruthy();
    expect(screen.getByText('Deleted projects (1)')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Delete project/ })).toBeNull();
    expect(nativeConfirm).not.toHaveBeenCalled();
  });

  it('does not delete when cancelled, and reports a failed delete', async () => {
    const user = userEvent.setup();
    api.listProjects.mockResolvedValue([primaryProject]);
    render(<App />);
    await user.click(await screen.findByRole('button', { name: /^Delete project/ }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(api.deleteProject).not.toHaveBeenCalled();

    api.deleteProject.mockRejectedValueOnce(new Error('offline'));
    await user.click(screen.getByRole('button', { name: /^Delete project/ }));
    await user.type(screen.getByLabelText(/Type/), primaryProject.name);
    await user.click(screen.getByRole('button', { name: 'Delete project' }));
    expect(await screen.findByText(/The project could not be deleted/)).toBeTruthy();
  });

  it('shows an empty state when there are no projects', async () => {
    api.listProjects.mockResolvedValue([]);
    render(<App />);
    expect(await screen.findByText('No projects yet')).toBeTruthy();
  });
});
