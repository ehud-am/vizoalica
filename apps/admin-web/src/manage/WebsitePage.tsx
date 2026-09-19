import { useEffect, useState } from 'react';
import {
  deleteWebsite,
  getReachability,
  getStatus,
  updateWebsite,
  type Reachability,
  type Status,
  type Website
} from '../api/local-operations.js';
import { ActionButton } from '../components/ActionButton.js';
import { ConfirmDialog } from '../components/ConfirmDialog.js';
import { IdentifierList, identifiersFor } from '../components/IdentifierList.js';
import { OperationalStatus } from '../components/OperationalStatus.js';
import { PageHeader } from '../components/PageHeader.js';
import { WebsiteReachability } from '../components/WebsiteReachability.js';
import { hrefFor, navigate } from '../router.js';
import { useScope } from '../scope/ScopeProvider.js';
import { FlashMessage, useFlash } from '../shell/FlashProvider.js';
import { DangerZone } from './DangerZone.js';
import { nextStep } from './HealthPage.js';
import { WebsiteGate } from './WebsiteGate.js';

type Pending = 'disable' | 'delete';

function WebsiteHub({ website }: { website: Website }) {
  const scope = useScope();
  const flash = useFlash();
  const [status, setStatus] = useState<Status>();
  const [reachability, setReachability] = useState<Reachability>();
  const [checked, setChecked] = useState<'loading' | 'done' | 'failed'>('loading');
  const [pending, setPending] = useState<Pending>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const { projectId, project } = scope;

  useEffect(() => {
    setStatus(undefined);
    setReachability(undefined);
    setChecked('loading');
    let cancelled = false;
    Promise.all([
      getStatus(projectId, website.id),
      getReachability(projectId, website.id).catch(() => undefined)
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
  }, [projectId, website.id, website.status]);

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
      flash.show(
        `Website ${website.name} ${next === 'active' ? 'enabled' : 'disabled'} and audit recorded.`
      );
      await scope.refreshWebsites();
    });

  const remove = () =>
    run(async () => {
      await deleteWebsite(projectId, website.id);
      await scope.refreshWebsites();
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
            <a
              className="secondary button-link"
              href={hrefFor('manage/websites/:id/edit', website.id)}
            >
              Edit
            </a>
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
          <IdentifierList items={identifiersFor(projectId, website)} />
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
        </section>
      </div>

      <DangerZone
        target={website.name}
        description="Disabling stops collection but keeps history. Deleting removes the website and all of its data."
      >
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
