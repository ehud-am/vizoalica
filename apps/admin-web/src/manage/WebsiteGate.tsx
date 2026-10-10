import type { ReactNode } from 'react';
import type { Website } from '../api/local-operations.js';
import { NoProject } from '../components/NoProject.js';
import { hrefFor } from '../router.js';
import { useScope } from '../scope/ScopeProvider.js';

/**
 * Resolves the website a page is about from its address. It waits for the list to load, and only
 * then decides a website is missing, so a page never flashes "not found" while loading.
 */
export function WebsiteGate({
  websiteId,
  children
}: {
  websiteId: string;
  children: (website: Website) => ReactNode;
}) {
  const scope = useScope();
  const website = scope.websites.find((item) => item.id === websiteId);
  if (website) return <>{children(website)}</>;
  if (scope.activeProjects.length === 0)
    return (
      <div className="page">
        <NoProject />
      </div>
    );
  if (scope.websitesError)
    return (
      <div className="page">
        <p className="notice error" role="alert">
          Websites could not be loaded.{' '}
          <button
            className="link-button"
            type="button"
            onClick={() => void scope.refreshWebsites()}
          >
            Try again
          </button>
        </p>
      </div>
    );
  if (scope.websitesLoading)
    return (
      <div className="page" aria-busy="true">
        <p className="metric-empty">Loading website…</p>
      </div>
    );
  return (
    <div className="page website-missing">
      <div className="empty-list">
        <strong>Website not found</strong>
        <span>
          There is no website with this address in {scope.project?.name ?? 'the current project'}.
          It may have been deleted, or it may belong to another project.
        </span>
        <a className="primary button-link" href={hrefFor('manage/websites')}>
          Back to websites
        </a>
      </div>
    </div>
  );
}
