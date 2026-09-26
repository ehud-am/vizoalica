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

/** Adds a website to the project in scope. Asking for an address is the whole job. */
export function WebsiteAddPage() {
  const scope = useScope();
  const setup = useSetup();
  const flash = useFlash();
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState('');
  const { guard, dialog } = useDirtyGuard(dirty);
  const list = hrefFor('manage/websites');

  async function add(input: WebsiteInput) {
    // The project is the one chosen at the top; it is shown in the form, never asked.
    const target = scope.project;
    if (!target) {
      setError('The current project is no longer available. Choose a project and try again.');
      throw new Error('project_unavailable');
    }
    try {
      const created = await createWebsite(target.id, {
        name: input.name,
        allowedOrigins: input.allowedOrigins
      });
      void setup.refresh();
      await scope.refreshWebsites();
      flash.carry(
        `Website ${created.name} created in project ${target.name} (${target.id}). Next: install it.`
      );
      navigate('manage/websites/:id/install', created.id);
    } catch (reason) {
      setError(
        reason instanceof ApiError && reason.status === 404
          ? 'The current project is no longer available. Your entries were preserved.'
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
        description="Enter its address, then install it. It is added to the project chosen at the top."
      />
      {!scope.project ? (
        <NoProject />
      ) : (
        <section className="panel form-panel" aria-label="New website details">
          <WebsiteForm
            autoFocus
            projectName={scope.project?.name ?? ''}
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
