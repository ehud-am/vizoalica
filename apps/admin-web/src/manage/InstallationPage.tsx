import { useEffect, useState } from 'react';
import { getSnippet, type Integration } from '../api/local-operations.js';
import { IntegrationSnippet } from '../components/IntegrationSnippet.js';
import { NoProject } from '../components/NoProject.js';
import { hrefFor } from '../router.js';
import { useScope } from '../scope/ScopeProvider.js';

export function InstallationPage() {
  const { projectId, project, website, websites, selectWebsite } = useScope();
  const [snippet, setSnippet] = useState<Integration>();
  const [error, setError] = useState('');

  useEffect(() => {
    setSnippet(undefined);
    setError('');
    if (!projectId || !website) return;
    let cancelled = false;
    getSnippet(projectId, website.id)
      .then((value) => {
        if (!cancelled) setSnippet(value);
      })
      .catch(() => {
        if (!cancelled)
          setError('Installation details are temporarily unavailable. Try again safely.');
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, website?.id]);

  return (
    <div className="page installation-page" data-page="installation">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Manage{project ? ` · ${project.name}` : ''}</p>
          <h1>Installation</h1>
          <p>Connect a website to Vizoalica, then confirm it works.</p>
        </div>
      </div>
      {!projectId ? (
        <NoProject />
      ) : !website ? (
        <section className="panel">
          <h2>Choose a website</h2>
          {websites.length === 0 ? (
            <p>
              This project has no websites yet.{' '}
              <a href={hrefFor('manage/websites')}>Add a website</a> first.
            </p>
          ) : (
            <ul className="plain-list">
              {websites.map((item) => (
                <li key={item.id}>
                  <button
                    className="link-button"
                    type="button"
                    onClick={() => selectWebsite(item.id)}
                  >
                    Set up {item.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : (
        <>
          <ol className="install-steps">
            <li>Choose the static or dynamic installation option below.</li>
            <li>Add the snippet or public configuration to {website.name}, then deploy it.</li>
            <li>
              Open <a href={hrefFor('manage/health')}>Health</a> to confirm the website is reachable
              and collecting.
            </li>
          </ol>
          {error && (
            <p className="notice error" role="alert">
              {error}
            </p>
          )}
          {snippet && <IntegrationSnippet snippet={snippet} />}
        </>
      )}
    </div>
  );
}
