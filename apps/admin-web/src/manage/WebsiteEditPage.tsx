import { useState } from 'react';
import { updateWebsite, type Website } from '../api/local-operations.js';
import { PageHeader } from '../components/PageHeader.js';
import { WebsiteForm, type WebsiteInput } from '../components/WebsiteForm.js';
import { hrefFor, navigate } from '../router.js';
import { useScope } from '../scope/ScopeProvider.js';
import { useFlash } from '../shell/FlashProvider.js';
import { useDirtyGuard } from './useDirtyGuard.js';
import { WebsiteGate } from './WebsiteGate.js';

const sameOrigins = (a: string[], b: string[]) =>
  a.length === b.length && [...a].sort().join('\n') === [...b].sort().join('\n');

function EditForm({ website }: { website: Website }) {
  const scope = useScope();
  const flash = useFlash();
  const [dirty, setDirty] = useState(false);
  const { guard, dialog } = useDirtyGuard(dirty);
  const hub = hrefFor('manage/websites/:id', website.id);

  async function save(input: WebsiteInput) {
    await updateWebsite(scope.projectId, website.id, {
      name: input.name,
      allowedOrigins: input.allowedOrigins
    });
    await scope.refreshWebsites();
    const originsChanged = !sameOrigins(website.allowedOrigins, input.allowedOrigins);
    // The embed itself does not depend on the origins, but the site's own token endpoint keeps a
    // list of them, so a changed list is the one edit that can need a matching change on the site.
    flash.carry(
      originsChanged
        ? 'Website updated and audit recorded. Your site’s token endpoint keeps its own list of origins: update it to match (the VIZOALICA_SITE variable, or VIZOALICA_SITE_ORIGINS), then deploy. The Install page shows the current value.'
        : 'Website updated and audit recorded. Nothing needs to change on your installed site.'
    );
    navigate('manage/websites/:id', website.id);
  }

  return (
    <div className="page website-edit-page" data-page="website-edit">
      <PageHeader
        crumbs={[
          ...(scope.project ? [{ label: scope.project.name }] : []),
          { label: 'Websites', href: hrefFor('manage/websites') },
          { label: website.name, href: hub },
          { label: 'Edit' }
        ]}
        back={{ label: `Back to ${website.name}`, href: hub, onClick: guard(hub) }}
        title={`Edit ${website.name}`}
        description="Change the name, or where this website is allowed to send analytics from."
      />
      <section className="panel form-panel" aria-label="Edit website details">
        <WebsiteForm
          key={website.id}
          autoFocus
          initialName={website.name}
          initialOrigins={website.allowedOrigins}
          submitLabel="Save changes"
          onSubmit={save}
          onDirtyChange={setDirty}
          cancel={
            <a className="secondary button-link" href={hub} onClick={guard(hub)}>
              Cancel
            </a>
          }
        />
      </section>
      {dialog}
    </div>
  );
}

export function WebsiteEditPage({ websiteId }: { websiteId: string }) {
  return (
    <WebsiteGate websiteId={websiteId}>{(website) => <EditForm website={website} />}</WebsiteGate>
  );
}
