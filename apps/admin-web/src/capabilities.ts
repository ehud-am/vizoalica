/**
 * The console's capability matrix: everything a user can see or do, classified so a later
 * role-based access feature can allow or deny whole areas. Every control that changes state
 * carries one of these ids (see ActionButton), and tests verify the placement stays consistent.
 */
export type CapabilityClass = 'view' | 'operate' | 'administer';
export type Area = 'analytics' | 'manage' | 'shell';

export interface Capability {
  id: string;
  class: CapabilityClass;
  area: Area;
  description: string;
}

export const CAPABILITIES = [
  { id: 'view-analytics', class: 'view', area: 'analytics', description: 'See analytics' },
  { id: 'view-health', class: 'view', area: 'manage', description: 'See website health' },
  {
    id: 'view-installation',
    class: 'view',
    area: 'manage',
    description: 'See installation guidance'
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
  { id: 'delete-website', class: 'administer', area: 'manage', description: 'Delete a website' },
  { id: 'delete-project', class: 'administer', area: 'manage', description: 'Delete a project' },
  {
    id: 'set-theme',
    class: 'view',
    area: 'shell',
    description: 'Change the personal color theme'
  }
] as const satisfies readonly Capability[];

export type CapabilityId = (typeof CAPABILITIES)[number]['id'];

export function capabilityById(id: string): Capability | undefined {
  return CAPABILITIES.find((capability) => capability.id === id);
}
