import { useState } from 'react';
import { ApiError, createWebsite } from '../api/local-operations.js';
import { NoProject } from '../components/NoProject.js';
import { PageHeader } from '../components/PageHeader.js';
import { WebsiteForm, type WebsiteInput } from '../components/WebsiteForm.js';
import { hrefFor, navigate } from '../router.js';
import { useScope } from '../scope/ScopeProvider.js';
import { useSetup } from '../setup/SetupProvider.js';
import { useFlash } from '../shell/FlashProvider.js';
import { useDirtyGuard } from './useDirtyGuard.js';

/** Adds a website. Its first field is the project, so the owner is always chosen on purpose. */
export function WebsiteAddPage() {
  const scope = useScope();
  const setup = useSetup();
  const flash = useFlash();
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState('');
  const { guard, dialog } = useDirtyGuard(dirty);
  const list = hrefFor('manage/websites');

  async function add(input: WebsiteInput) {
    const target = scope.activeProjects.find((item) => item.id === input.projectId);
    if (!input.projectId || !target) {
      setError('The selected project is no longer available. Refresh Projects and try again.');
      throw new Error('project_unavailable');
    }
    try {
      const created = await createWebsite(input.projectId, {
        name: input.name,
        allowedOrigins: input.allowedOrigins
      });
      void setup.refresh();
      if (input.projectId === scope.projectId) await scope.refreshWebsites();
      else scope.selectProject(input.projectId);
      flash.carry(
        `Website ${created.name} created in project ${target.name} (${target.id}). Next: install it.`
      );
      navigate('manage/websites/:id/install', created.id);
    } catch (reason) {
      setError(
        reason instanceof ApiError && reason.status === 404
          ? 'The selected project is no longer available. Your entries were preserved.'
          : 'Website creation was interrupted. Your entries were preserved.'
      );
      throw reason;
    }
  }

  return (
    <div className="page website-add-page" data-page="website-add">
      <PageHeader
        crumbs={[
          ...(scope.project ? [{ label: scope.project.name }] : []),
          { label: 'Websites', href: list },
          { label: 'Add website' }
        ]}
        back={{ label: 'Back to websites', href: list, onClick: guard(list) }}
        title="Add a website"
        description="Register a website, then install it. You choose the project it belongs to first."
      />
      {scope.activeProjects.length === 0 ? (
        <NoProject />
      ) : (
        <section className="panel form-panel" aria-label="New website details">
          <WebsiteForm
            autoFocus
            projects={scope.activeProjects}
            onSubmit={add}
            onDirtyChange={setDirty}
            cancel={
              <a className="secondary button-link" href={list} onClick={guard(list)}>
                Cancel
              </a>
            }
          />
          {error && (
            <p className="notice error" role="alert">
              {error}
            </p>
          )}
        </section>
      )}
      {dialog}
    </div>
  );
}
