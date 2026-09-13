import type { Project, Website } from '../../src/api/local-operations.js';

export const primaryProject: Project = {
  id: 'project-1',
  name: 'Developer Tools',
  websiteCount: 1
};

export const duplicateNameProject: Project = {
  id: 'project-2',
  name: 'Developer Tools',
  websiteCount: 0
};

export const consoleProjects: Project[] = [primaryProject, duplicateNameProject];

export const emptyProjects: Project[] = [];

export const primaryWebsite: Website = {
  id: 'site-1',
  projectId: primaryProject.id,
  name: 'Docs',
  publicSourceKey: 'public-key',
  allowedOrigins: ['https://docs.example.com'],
  status: 'active'
};
