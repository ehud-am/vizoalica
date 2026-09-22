/**
 * The console's capability matrix: everything a user can see or do, classified so whole areas can be
 * allowed or denied by role. Every control that changes state carries one of these ids (see
 * ActionButton), and tests verify the placement stays consistent.
 *
 * `view` reads analytics and configuration. `operate` creates and manages projects and websites.
 * `backend` changes the Worker or database, secrets, purging, sample data, or access keys.
 */
export type CapabilityClass = 'view' | 'operate' | 'backend';
export type Area = 'analytics' | 'manage' | 'shell';

export interface Capability {
  id: string;
  class: CapabilityClass;
  area: Area;
  description: string;
}

export const CAPABILITIES = [
  { id: 'view-analytics', class: 'view', area: 'analytics', description: 'See analytics' },
  {
    id: 'view-configuration',
    class: 'view',
    area: 'manage',
    description: 'See projects, websites, and installation details'
  },
  { id: 'view-health', class: 'view', area: 'manage', description: 'See website health' },
  {
    id: 'view-installation',
    class: 'view',
    area: 'manage',
    description: 'See installation guidance'
  },
  {
    id: 'view-backend',
    class: 'view',
    area: 'manage',
    description: 'See the backend, its versions, and its health'
  },
  {
    id: 'download-sdk',
    class: 'view',
    area: 'manage',
    description: 'Download the browser SDK files'
  },
  {
    id: 'set-theme',
    class: 'view',
    area: 'shell',
    description: 'Change the personal color theme'
  },
  { id: 'create-project', class: 'operate', area: 'manage', description: 'Create a project' },
  { id: 'add-website', class: 'operate', area: 'manage', description: 'Add a website' },
  { id: 'edit-website', class: 'operate', area: 'manage', description: 'Edit a website' },
  {
    id: 'toggle-website',
    class: 'operate',
    area: 'manage',
    description: 'Enable or disable a website'
  },
  { id: 'delete-website', class: 'operate', area: 'manage', description: 'Delete a website' },
  { id: 'delete-project', class: 'operate', area: 'manage', description: 'Delete a project' },
  {
    id: 'deploy-backend',
    class: 'backend',
    area: 'manage',
    description: 'Deploy a backend to Cloudflare'
  },
  {
    id: 'update-backend',
    class: 'backend',
    area: 'manage',
    description: 'Update the Worker and database'
  },
  { id: 'rotate-secret', class: 'backend', area: 'manage', description: 'Replace a secret' },
  {
    id: 'purge-deleted',
    class: 'backend',
    area: 'manage',
    description: 'Permanently remove deleted data'
  },
  { id: 'manage-demo', class: 'backend', area: 'manage', description: 'Add or remove sample data' },
  {
    id: 'manage-access-keys',
    class: 'backend',
    area: 'manage',
    description: 'Issue and revoke access keys'
  },
  {
    id: 'share-website-setup',
    class: 'backend',
    area: 'manage',
    description: 'Share website setup details'
  }
] as const satisfies readonly Capability[];

export type CapabilityId = (typeof CAPABILITIES)[number]['id'];

export function capabilityById(id: string): Capability | undefined {
  return CAPABILITIES.find((capability) => capability.id === id);
}
