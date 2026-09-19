import { NoProject } from '../components/NoProject.js';
import { PageHeader } from '../components/PageHeader.js';
import { WebsiteCard } from '../components/WebsiteCard.js';
import { hrefFor } from '../router.js';
import { useScope } from '../scope/ScopeProvider.js';
import { FlashMessage } from '../shell/FlashProvider.js';
import { PlusIcon } from '../components/Icons.js';

/** The list of the current project's websites. It only lists; every task has a page of its own. */
export function WebsitesPage() {
  const scope = useScope();
  const { project } = scope;
  const noProject = scope.activeProjects.length === 0;
  return (
    <div className="page websites-page" data-page="websites">
      <PageHeader
        crumbs={[...(project ? [{ label: project.name }] : []), { label: 'Websites' }]}
        title="Websites"
        description="The websites that send analytics to this project. Open one to see it, edit it, or install it."
        actions={
          !noProject && (
            <a className="primary button-link" href={hrefFor('manage/websites/new')}>
              <PlusIcon size={16} />
              Add website
            </a>
          )
        }
      />
      <FlashMessage />
      {noProject ? (
        <NoProject />
      ) : scope.websitesError ? (
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
      ) : scope.websitesLoading ? (
        <div className="website-grid" aria-busy="true" aria-label="Loading websites">
          {Array.from({ length: 3 }, (_, index) => (
            <div key={index} className="website-card skeleton" aria-hidden="true" />
          ))}
        </div>
      ) : scope.websites.length === 0 ? (
        <div className="empty-list">
          <strong>No websites yet</strong>
          <span>
            A website is a site you want to measure. Add one, then install a small snippet on it.
          </span>
          <a className="primary button-link" href={hrefFor('manage/websites/new')}>
            Add your first website
          </a>
        </div>
      ) : (
        <ul className="website-grid" aria-label="Websites">
          {scope.websites.map((website) => (
            <li key={website.id}>
              <WebsiteCard website={website} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
