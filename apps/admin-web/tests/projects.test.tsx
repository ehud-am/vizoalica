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

/** The project the header says the console is working in. */
const scopeProject = () => screen.getByRole('button', { name: /^Project/ }).getAttribute('title');
const headerProject = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole('button', { name: /^Project/ }));
  return screen.getByRole('menu', { name: 'Project' });
};

describe('Manage > Projects', () => {
  it('identifies duplicate project names by stable ID, and is the one page without the project menu', async () => {
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Projects' })).toBeTruthy();
    expect(screen.getByText(primaryProject.id)).toBeTruthy();
    expect(screen.getByText(duplicateNameProject.id)).toBeTruthy();
    expect(screen.getAllByText('Developer Tools')).toHaveLength(2);
    // Projects run outside the environment/project pair: the environment stays, the project goes.
    expect(screen.queryByRole('button', { name: /^Project/ })).toBeNull();
    expect(screen.getByRole('button', { name: /^Environment/ })).toBeTruthy();
    expect(screen.queryByLabelText('Website')).toBeNull();
    // Projects is not in the sidebar: it is reached from the project menu.
    expect(screen.queryByRole('link', { name: 'Projects' })).toBeNull();
  });

  it('marks the current project and opens another in Websites, making it current', async () => {
    const user = userEvent.setup();
    render(<App />);
    const current = await screen.findByText('Current');
    expect(current.closest('article')!.textContent).toContain(primaryProject.id);
    await user.click(
      await screen.findByRole('link', {
        name: `Open ${duplicateNameProject.name} (${duplicateNameProject.id})`
      })
    );
    await waitFor(() => expect(api.listWebsites).toHaveBeenCalledWith(duplicateNameProject.id));
    expect(document.querySelector('main')?.getAttribute('data-route')).toBe('manage/websites');
    expect(scopeProject()).toBe(duplicateNameProject.id);
  });

  it('is where the project menu points, and the only place that creates projects', async () => {
    const user = userEvent.setup();
    window.location.hash = '#/manage/websites';
    render(<App />);
    await screen.findByRole('heading', { level: 1, name: 'Websites' });
    const menu = await headerProject(user);
    expect(within(menu).queryByRole('textbox')).toBeNull();
    await user.click(within(menu).getByRole('menuitem', { name: 'All projects…' }));
    expect(await screen.findByRole('heading', { name: 'Projects' })).toBeTruthy();
    expect(screen.getByRole('textbox', { name: 'Project name' })).toBeTruthy();
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

  it('falls back to another project when the current one is deleted, and to the create-first state when none is left', async () => {
    const user = userEvent.setup();
    const gone = (project: typeof primaryProject) => ({ ...project, status: 'deleted' as const });
    api.listProjects
      .mockResolvedValueOnce(consoleProjects)
      .mockResolvedValueOnce([gone(primaryProject), duplicateNameProject])
      .mockResolvedValueOnce([gone(primaryProject), gone(duplicateNameProject)]);
    render(<App />);
    const first = (await screen.findAllByRole('button', { name: /^Delete project/ }))[0]!;
    await user.click(first);
    await user.type(screen.getByLabelText(/Type/), primaryProject.name);
    await user.click(screen.getByRole('button', { name: 'Delete project' }));
    await screen.findByText(/Project Developer Tools deleted/);
    // The remaining project is now the one the console works in.
    await user.click(screen.getByRole('link', { name: 'Websites' }));
    expect(scopeProject()).toBe(duplicateNameProject.id);
    await user.click(screen.getByRole('button', { name: /^Project/ }));
    await user.click(screen.getByRole('menuitem', { name: 'All projects…' }));
    await user.click(await screen.findByRole('button', { name: /^Delete project/ }));
    await user.type(screen.getByLabelText(/Type/), duplicateNameProject.name);
    await user.click(screen.getByRole('button', { name: 'Delete project' }));
    await screen.findByText('No projects yet');
    window.location.hash = '#/manage/websites';
    const button = await screen.findByRole('button', { name: /^Project/ });
    expect(button.textContent).toContain('No project yet');
    await user.click(button);
    expect(screen.getByRole('menuitem', { name: 'Create your first project' })).toBeTruthy();
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
