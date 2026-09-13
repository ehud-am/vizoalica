// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App.js';
import { consoleProjects, duplicateNameProject, primaryProject } from './fixtures/console.js';

const api = vi.hoisted(() => ({
  bootstrapSession: vi.fn(),
  listProjects: vi.fn(),
  createProject: vi.fn(),
  listWebsites: vi.fn(),
  getAnalyticsOverview: vi.fn(),
  getThemePreference: vi.fn(),
  putThemePreference: vi.fn()
}));

vi.mock('../src/api/local-operations.js', async (load) => ({ ...(await load()), ...api }));

beforeEach(() => {
  api.bootstrapSession.mockResolvedValue(undefined);
  api.listProjects.mockResolvedValue(consoleProjects);
  api.createProject.mockResolvedValue({ id: 'project-3', name: 'Marketing', websiteCount: 0 });
  api.listWebsites.mockResolvedValue([]);
  api.getAnalyticsOverview.mockResolvedValue({
    scope: {
      projectId: primaryProject.id,
      sourceId: null,
      label: 'All websites',
      identityMode: 'project-supplied'
    },
    range: {
      startUtc: '2026-01-01T00:00:00.000Z',
      endUtc: '2026-01-02T00:00:00.000Z',
      interval: 'hour',
      timezone: 'UTC'
    },
    totals: { pageViews: 0, uniqueUsers: 0 },
    trend: [],
    rankings: {
      pagePaths: { items: [], otherCount: 0, total: 0 },
      countries: { items: [], otherCount: 0, total: 0 },
      userAgents: { items: [], otherCount: 0, total: 0 },
      referrers: { items: [], otherCount: 0, total: 0 }
    },
    distributions: {
      operatingSystems: { items: [], total: 0 },
      browsers: { items: [], total: 0 },
      devices: { items: [], total: 0 },
      traffic: { items: [], total: 0 }
    },
    availability: { state: 'complete', taxonomyVersions: [1] }
  });
  api.getThemePreference.mockResolvedValue({ theme: null });
  api.putThemePreference.mockResolvedValue({ theme: 'light' });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('Projects destination', () => {
  it('is primary navigation and identifies duplicate project names by stable ID', async () => {
    const user = userEvent.setup();
    render(<App />);

    const projectsNavigation = await screen.findByRole('button', { name: 'Projects' });
    expect(projectsNavigation.parentElement?.firstElementChild).toBe(projectsNavigation);
    await user.click(projectsNavigation);

    expect(await screen.findByRole('heading', { name: 'Projects' })).toBeTruthy();
    expect(screen.getByText(primaryProject.id)).toBeTruthy();
    expect(screen.getByText(duplicateNameProject.id)).toBeTruthy();
    expect(screen.getAllByText('Developer Tools')).toHaveLength(2);
    expect(projectsNavigation.getAttribute('aria-current')).toBe('page');
  });

  it('selects a project and opens only that project in downstream destinations', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Projects' }));

    await user.click(
      screen.getByRole('button', {
        name: `Select ${duplicateNameProject.name} (${duplicateNameProject.id})`
      })
    );
    expect(
      screen
        .getByRole('button', {
          name: `Select ${duplicateNameProject.name} (${duplicateNameProject.id})`
        })
        .getAttribute('aria-pressed')
    ).toBe('true');

    await user.click(
      screen.getByRole('button', {
        name: `Open websites for ${duplicateNameProject.name} (${duplicateNameProject.id})`
      })
    );
    await waitFor(() => expect(api.listWebsites).toHaveBeenCalledWith(duplicateNameProject.id));
    expect(document.querySelector('main')?.getAttribute('data-view')).toBe('websites');
    expect(
      (screen.getByRole('combobox', { name: 'Browsing project' }) as HTMLSelectElement).value
    ).toBe(duplicateNameProject.id);

    await user.click(screen.getByRole('button', { name: 'Projects' }));
    await user.click(
      screen.getByRole('button', {
        name: `Open analytics for ${duplicateNameProject.name} (${duplicateNameProject.id})`
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
    expect(document.querySelector('main')?.getAttribute('data-view')).toBe('overview');
  });

  it('creates a project with an inline form and makes it the current context', async () => {
    const user = userEvent.setup();
    const created = { id: 'project-3', name: 'Marketing', websiteCount: 0 };
    api.listProjects
      .mockResolvedValueOnce(consoleProjects)
      .mockResolvedValueOnce([...consoleProjects, created]);
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Projects' }));
    await user.type(screen.getByRole('textbox', { name: 'Project name' }), created.name);
    await user.click(screen.getByRole('button', { name: 'Create project' }));

    await waitFor(() => expect(api.createProject).toHaveBeenCalledWith(created.name));
    expect(await screen.findByText(`Project ${created.name} created.`)).toBeTruthy();
    expect(
      screen
        .getByRole('button', { name: `Select ${created.name} (${created.id})` })
        .getAttribute('aria-pressed')
    ).toBe('true');
  });
});
