import { useEffect, useState } from 'react';
import { getSiteSpec, type SiteSpecView } from '../api/local-operations.js';
import { CodeBlock } from '../components/CodeBlock.js';
import { NoProject } from '../components/NoProject.js';
import { PageHeader } from '../components/PageHeader.js';
import { useScope } from '../scope/ScopeProvider.js';

/**
 * The latest spec (ontology) stored on the backend for one website, in plain words. View-only:
 * the spec is created by /vizoalica learn and changed with `vizoalica spec apply`.
 */
export function SpecPage() {
  const { projectId, website } = useScope();
  const [spec, setSpec] = useState<SiteSpecView | undefined>();
  const [failed, setFailed] = useState(false);
  const websiteId = website?.id;

  useEffect(() => {
    setSpec(undefined);
    setFailed(false);
    if (!projectId || !websiteId) return;
    const controller = new AbortController();
    getSiteSpec(projectId, websiteId, controller.signal)
      .then(setSpec)
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });
    return () => controller.abort();
  }, [projectId, websiteId]);

  return (
    <div className="page">
      <PageHeader
        crumbs={[{ label: 'Manage' }, { label: 'Spec' }]}
        title="Spec"
        description="What the assistant learned about this website: named pages, actions, events, campaigns, funnels and paths. View-only."
      />
      {!projectId ? (
        <NoProject />
      ) : !website ? (
        <p className="hint" role="status">
          Choose a website above to see its spec.
        </p>
      ) : failed ? (
        <p className="notice error" role="alert">
          The spec could not be loaded. Check the backend with <code>vizoalica env check</code>.
        </p>
      ) : !spec ? (
        <p className="hint" role="status">
          Loading the spec.
        </p>
      ) : spec.version === 0 ? (
        <section className="dashboard-card" aria-label="No spec yet">
          <p className="chart-empty" role="status">
            No spec yet for {website.name}. Ask your assistant <code>/vizoalica learn</code>, review
            the files, then run <code>vizoalica spec apply &lt;environment&gt;</code>.
          </p>
        </section>
      ) : (
        <>
          <p className="hint" role="status">
            Version {spec.version}
            {spec.appliedAt ? `, applied ${spec.appliedAt.slice(0, 10)}` : ''}. To change it:{' '}
            <code>vizoalica spec pull &lt;environment&gt;</code>, edit the files, then{' '}
            <code>vizoalica spec apply &lt;environment&gt;</code>. With git, edit the folder in your
            repository instead.
          </p>
          <CodeBlock label="Spec in words" code={spec.renderedMd ?? ''} what="the spec" />
        </>
      )}
    </div>
  );
}
