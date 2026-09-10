import type { Project, Website } from '../api/local-operations.js';
import { WebsiteSelector } from './WebsiteSelector.js';

export function DashboardFilters(props: {
  projects: Project[];
  websites: Website[];
  projectId: string;
  websiteId: string;
  onProjectChange: (id: string) => void;
  onWebsiteChange: (id: string) => void;
}) {
  return <WebsiteSelector {...props} />;
}
