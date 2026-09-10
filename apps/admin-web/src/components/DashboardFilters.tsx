import type { Project, Website } from '../api/local-operations.js';
import type { AppliedRange } from '../time-range.js';
import { TimeRangeSelector } from './TimeRangeSelector.js';
import { WebsiteSelector } from './WebsiteSelector.js';

export function DashboardFilters(props: {
  projects: Project[];
  websites: Website[];
  projectId: string;
  websiteId: string;
  onProjectChange: (id: string) => void;
  onWebsiteChange: (id: string) => void;
  range: AppliedRange;
  onRangeApply: (range: AppliedRange) => void;
}) {
  return (
    <>
      <WebsiteSelector {...props} />
      <TimeRangeSelector applied={props.range} onApply={props.onRangeApply} />
    </>
  );
}
