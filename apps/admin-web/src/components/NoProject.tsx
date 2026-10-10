import { hrefFor } from '../router.js';

/** Shown by every scope-bound screen when no project exists yet. */
export function NoProject() {
  return (
    <div className="empty-list project-empty">
      <strong>Create a project first</strong>
      <span>Projects hold your websites and their analytics. Create one to get started.</span>
      <a className="primary button-link" href={hrefFor('manage/projects')}>
        Create a project
      </a>
    </div>
  );
}
