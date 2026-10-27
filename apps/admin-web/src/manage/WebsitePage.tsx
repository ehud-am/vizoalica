import { useEffect, useState } from 'react';
import {
  deleteWebsite,
  getAnalyticsOverview,
  getExcludedHits,
  getReachability,
  getStatus,
  updateWebsite,
  type ExcludedHits,
  type Reachability,
  type Status,
  type Website
} from '../api/local-operations.js';
import { ActionButton, ActionLink } from '../components/ActionButton.js';
import { CodeBlock } from '../components/CodeBlock.js';
import { ConfirmDialog } from '../components/ConfirmDialog.js';
import { IdentifierList, identifiersFor } from '../components/IdentifierList.js';
import { OperationalStatus } from '../components/OperationalStatus.js';
import { PageHeader } from '../components/PageHeader.js';
import { WebsiteReachability } from '../components/WebsiteReachability.js';
import { hrefFor, navigate } from '../router.js';
import { useScope } from '../scope/ScopeProvider.js';
import { FlashMessage, useFlash } from '../shell/FlashProvider.js';
import { useSetup } from '../setup/SetupProvider.js';
import { presetToRange } from '../time-range.js';
import { DangerZone } from './DangerZone.js';
import { nextStep } from './HealthPage.js';
import { WebsiteGate } from './WebsiteGate.js';

type Pending = 'disable' | 'delete';

/** How many addresses are excluded and how many events that dropped, with the way to change it. */
function ExcludedVisits({
  website,
  hits
}: {
  website: Website;
  hits: ExcludedHits | 'unavailable' | undefined;
}) {
  const count = website.excludedAddressCount ?? website.excludedAddresses?.length ?? 0;
  const docs = 'https://vizoalica.dev/operations/internal-traffic';
  // A backend older than 0.11 sends neither the list nor its count, and cannot apply a list.
  if (website.excludedAddressCount === undefined && website.excludedAddresses === undefined)
    return (
      <p className="hint">
        This backend is older than 0.11, so it cannot leave addresses out yet. Update it with{' '}
        <code>vizoalica deploy &lt;name&gt; --update</code>. A browser can already opt out by
        opening your site once with <code>?vizoalica_ignore=1</code> (the site must run SDK 0.11 or
        later). <a href={docs}>How it works</a>
      </p>
    );
  return (
    <>
      {count === 0 ? (
        <p className="hint">
          No addresses are excluded, so visits from you and your team are counted. Add the addresses
          you visit from, or open your site once with <code>?vizoalica_ignore=1</code> in each
          browser to leave that browser out. <a href={docs}>How it works</a>
        </p>
      ) : (
        <>
          <p>
            <strong>{count.toLocaleString()}</strong>{' '}
            {count === 1 ? 'address or range' : 'addresses or ranges'} excluded.
          </p>
          {hits === undefined && (
            <p className="metric-empty" aria-busy="true">
              Checking…
            </p>
          )}
          {hits === 'unavailable' && (
            <p className="hint">
              Dropped events cannot be counted yet. Update the backend to see them.
            </p>
          )}
          {hits && hits !== 'unavailable' && (
            <>
              <p role="status">
                <strong>{hits.total.toLocaleString()}</strong>{' '}
                {hits.total === 1 ? 'event' : 'events'} dropped in the last {hits.windowDays} days.
              </p>
              {hits.days.length > 0 && (
                <ul className="origin-list" aria-label="Events dropped per day">
                  {hits.days.slice(0, 7).map((entry) => (
                    <li key={entry.day}>
                      <code>{entry.day}</code>: {entry.count.toLocaleString()}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
          <p className="hint">
            Only excluded addresses are counted. Browsers that opted out with{' '}
            <code>?vizoalica_ignore=1</code> send nothing, so they cannot be counted.{' '}
            <a href={docs}>How it works</a>
          </p>
        </>
      )}
      <ActionLink
        capability="edit-website"
        className="secondary button-link"
        href={hrefFor('manage/websites/:id/edit', website.id)}
      >
        {count === 0 ? 'Exclude addresses' : 'Change excluded addresses'}
      </ActionLink>
    </>
  );
}

/** The README snippet when the pixel is on; otherwise what it is and where to switch it on. */
function PixelPanel({ website, endpoint }: { website: Website; endpoint?: string }) {
  const docs = 'https://vizoalica.dev/operations/pixel';
  if (website.pixelEnabled === undefined)
    return (
      <p className="hint">
        This backend is older than 0.13, so it cannot count pixel views yet. Update it with{' '}
        <code>vizoalica deploy &lt;name&gt; --update</code>. <a href={docs}>How it works</a>
      </p>
    );
  const url = endpoint
    ? `${new URL('/v1/pixel.gif', endpoint).href}?website=${encodeURIComponent(website.publicSourceKey)}&path=/readme`
    : undefined;
  return (
    <>
      {website.pixelEnabled && url ? (
        <>
          <p>
            On. Add this to a README. Change <code>path</code> for each page, so views are told
            apart.
          </p>
          <CodeBlock label="README image" code={`![](${url})`} what="README image" />
        </>
      ) : (
        <p className="hint">
          Off. Switch it on to count views of a README or any page that cannot run scripts.{' '}
          <a href={docs}>How it works</a>
        </p>
      )}
      <ActionLink
        capability="edit-website"
        className="secondary button-link"
        href={hrefFor('manage/websites/:id/edit', website.id)}
      >
        {website.pixelEnabled ? 'Change pixel setting' : 'Turn on the pixel'}
      </ActionLink>
    </>
  );
}

function WebsiteHub({ website }: { website: Website }) {
  const scope = useScope();
  const setup = useSetup();
  const flash = useFlash();
  const [status, setStatus] = useState<Status>();
  const [reachability, setReachability] = useState<Reachability>();
  const [checked, setChecked] = useState<'loading' | 'done' | 'failed'>('loading');
  // Page views in the last day, for "is it installed?". Undefined until known, or if it cannot be.
  const [recent, setRecent] = useState<number>();
  // Events dropped for excluded addresses; 'unavailable' for a backend that does not count them.
  const [excludedHits, setExcludedHits] = useState<ExcludedHits | 'unavailable'>();
  const [pending, setPending] = useState<Pending>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const { projectId, project } = scope;
  const workerUrl = setup.state?.connection.workerUrl;

  useEffect(() => {
    setStatus(undefined);
    setReachability(undefined);
    setChecked('loading');
    setRecent(undefined);
    setExcludedHits(undefined);
    let cancelled = false;
    getExcludedHits(projectId, website.id)
      .then((hits) => !cancelled && setExcludedHits(hits))
      .catch(() => !cancelled && setExcludedHits('unavailable'));
    const range = presetToRange('24h');
    getAnalyticsOverview(projectId, website.id, range.startUtc, range.endUtc)
      .then((overview) => !cancelled && setRecent(overview.totals.pageViews))
      .catch(() => undefined);
    Promise.all([
      getStatus(projectId, website.id),
      // A website with no token has no configuration endpoint to check; its Install page checks the tag.
      website.tokenRequired === false
        ? Promise.resolve(undefined)
        : getReachability(projectId, website.id).catch(() => undefined)
    ])
      .then(([nextStatus, nextReachability]) => {
        if (cancelled) return;
        setStatus(nextStatus);
        setReachability(nextReachability);
        setChecked('done');
      })
      .catch(() => {
        if (!cancelled) setChecked('failed');
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, website.id, website.status, website.tokenRequired]);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError('');
    try {
      await action();
    } catch {
      setError(
        'The operation was interrupted. Check the current status, then retry safely if needed.'
      );
    } finally {
      setBusy(false);
      setPending(undefined);
    }
  }

  const setAvailability = (next: 'active' | 'disabled') =>
    run(async () => {
      await updateWebsite(projectId, website.id, { status: next });
      flash.show(`Website ${website.name} ${next === 'active' ? 'enabled' : 'disabled'}.`);
      await scope.refreshWebsites();
      void setup.refresh();
    });

  const remove = () =>
    run(async () => {
      await deleteWebsite(projectId, website.id);
      await scope.refreshWebsites();
      void setup.refresh();
      flash.carry(
        `Website ${website.name} deleted. Its data will be permanently removed within a day.`
      );
      navigate('manage/websites');
    });

  return (
    <div className="page website-page" data-page="website">
      <PageHeader
        crumbs={[
          ...(project ? [{ label: project.name }] : []),
          { label: 'Websites', href: hrefFor('manage/websites') },
          { label: website.name }
        ]}
        title={website.name}
        status={<span className={`status ${website.status} title-status`}>{website.status}</span>}
        actions={
          <>
            <ActionLink
              capability="edit-website"
              className="secondary button-link"
              href={hrefFor('manage/websites/:id/edit', website.id)}
            >
              Edit
            </ActionLink>
            <a
              className="secondary button-link"
              href={hrefFor('analytics/overview')}
              onClick={() => scope.selectWebsite(website.id)}
            >
              View analytics
            </a>
            <a
              className="primary button-link"
              href={hrefFor('manage/websites/:id/install', website.id)}
            >
              Install
            </a>
          </>
        }
      />
      <FlashMessage />
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {website.status === 'disabled' && (
        <div className="notice" role="status">
          <p>
            This website is disabled. It is not collecting new events, and its history stays
            available.
          </p>
          <ActionButton
            capability="toggle-website"
            className="secondary"
            disabled={busy}
            onClick={() => void setAvailability('active')}
          >
            Enable website
          </ActionButton>
        </div>
      )}

      <div className="website-sections">
        <section className="detail-card" aria-labelledby="website-details-heading">
          <h2 id="website-details-heading">Details</h2>
          <h3 className="sub-heading">Allowed origins</h3>
          <ul className="origin-list">
            {website.allowedOrigins.map((origin) => (
              <li key={origin}>
                <code>{origin}</code>
              </li>
            ))}
          </ul>
          <h3 className="sub-heading">Identifiers</h3>
          <IdentifierList
            items={identifiersFor(projectId, website, setup.state?.connection.workerUrl)}
          />
          <p className="hint">These are public identifiers, not secrets.</p>
        </section>

        <section className="detail-card" aria-labelledby="website-status-heading">
          <h2 id="website-status-heading">Status</h2>
          {checked === 'loading' && (
            <p className="metric-empty" aria-busy="true">
              Checking…
            </p>
          )}
          {checked === 'failed' && (
            <p className="notice error" role="alert">
              Status is unavailable. Check the local API, then reload this page.
            </p>
          )}
          {checked === 'done' && status && (
            <>
              <p className="next-step">
                <strong>Next step:</strong>{' '}
                {nextStep(website, {
                  status,
                  ...(reachability ? { reachability } : {}),
                  failed: false
                })}
              </p>
              <OperationalStatus status={status} bare />
              {reachability && <WebsiteReachability reachability={reachability} bare />}
            </>
          )}
          {website.status === 'active' && (
            <ActionButton
              capability="toggle-website"
              className="secondary"
              disabled={busy}
              onClick={() => setPending('disable')}
            >
              Disable website…
            </ActionButton>
          )}
        </section>

        <section className="detail-card" aria-labelledby="website-excluded-heading">
          <h2 id="website-excluded-heading">Your own visits</h2>
          <ExcludedVisits website={website} hits={excludedHits} />
        </section>

        <section className="detail-card" aria-labelledby="website-pixel-heading">
          <h2 id="website-pixel-heading">No-script pixel</h2>
          <PixelPanel website={website} {...(workerUrl ? { endpoint: workerUrl } : {})} />
        </section>

        <section className="detail-card" aria-labelledby="website-install-heading">
          <h2 id="website-install-heading">Install</h2>
          {recent === undefined ? (
            <p className="hint">Not checked yet. Open the install steps to add it to your site.</p>
          ) : recent > 0 ? (
            <p className="notice success" role="status">
              <strong>Installed.</strong> {recent.toLocaleString()}{' '}
              {recent === 1 ? 'page view' : 'page views'} in the last 24 hours.
            </p>
          ) : (
            <p className="hint">
              No page views in the last 24 hours. If you have not installed it yet, start with the
              install steps.
            </p>
          )}
          <a
            className={`${recent && recent > 0 ? 'secondary' : 'primary'} button-link`}
            href={hrefFor('manage/websites/:id/install', website.id)}
          >
            {recent && recent > 0 ? 'Install steps and check' : 'Install this website'}
          </a>
        </section>
      </div>

      {setup.state?.principal?.role === 'admin' && (
        <section className="detail-card" aria-labelledby="website-access-heading">
          <h2 id="website-access-heading">Access keys</h2>
          <p className="hint">
            Let a website owner, an analyst, or a pipeline use this website without your admin key.
            Create, rename, rotate, or delete keys.
          </p>
          <a
            className="secondary button-link"
            href={hrefFor('manage/websites/:id/access', website.id)}
          >
            Manage access keys
          </a>
        </section>
      )}

      <DangerZone
        target={website.name}
        description="Deleting removes the website and all of its data. The tag on your live site will stop recording, and keeps asking quietly until you take it out."
      >
        <ActionButton
          capability="delete-website"
          className="danger"
          disabled={busy}
          onClick={() => setPending('delete')}
        >
          Delete website…
        </ActionButton>
      </DangerZone>

      {pending === 'delete' && (
        <ConfirmDialog
          title={`Delete ${website.name}?`}
          confirmLabel="Delete website"
          busy={busy}
          onConfirm={() => void remove()}
          onCancel={() => setPending(undefined)}
        >
          <p>
            This deletes <strong>{website.name}</strong> and is permanent: its data, analytics and
            audit entries are removed within a day.
          </p>
          <p>
            The Vizoalica tag on your live site will stop recording, and it will not show an error.
            Remove it from your pages if you no longer want it there.
          </p>
        </ConfirmDialog>
      )}
      {pending === 'disable' && (
        <ConfirmDialog
          title={`Disable ${website.name}?`}
          confirmLabel="Disable website"
          busy={busy}
          onConfirm={() => void setAvailability('disabled')}
          onCancel={() => setPending(undefined)}
        >
          <p>
            <strong>{website.name}</strong> will stop collecting new events. Its history stays
            available, and you can enable it again at any time.
          </p>
        </ConfirmDialog>
      )}
    </div>
  );
}

export function WebsitePage({ websiteId }: { websiteId: string }) {
  return (
    <WebsiteGate websiteId={websiteId}>{(website) => <WebsiteHub website={website} />}</WebsiteGate>
  );
}
