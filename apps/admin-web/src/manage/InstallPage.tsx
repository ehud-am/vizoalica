import { useCallback, useEffect, useState } from 'react';
import { getSnippet, type Integration, type Website } from '../api/local-operations.js';
import { IdentifierList, identifiersFor } from '../components/IdentifierList.js';
import { PageHeader } from '../components/PageHeader.js';
import { Tabs } from '../components/Tabs.js';
import { hrefFor } from '../router.js';
import { useScope } from '../scope/ScopeProvider.js';
import { FlashMessage } from '../shell/FlashProvider.js';
import { GithubPath } from './install/GithubPath.js';
import {
  RECOMMENDED_PATH,
  modesOf,
  readPath,
  writePath,
  type InstallPath
} from './install/paths.js';
import { SnippetPath } from './install/SnippetPath.js';
import { WebsiteGate } from './WebsiteGate.js';

function PathCard({
  title,
  badge,
  text,
  technical,
  unavailable
}: {
  title: string;
  badge?: string;
  text: string;
  technical: string;
  unavailable?: string;
}) {
  return (
    <span className="path-card">
      <span className="path-title">
        {title}
        {badge && <span className="badge">{badge}</span>}
      </span>
      <span className="path-text">{unavailable ?? text}</span>
      <span className="path-technical">{technical}</span>
    </span>
  );
}

function Install({ website }: { website: Website }) {
  const scope = useScope();
  const { projectId, project } = scope;
  const [integration, setIntegration] = useState<Integration>();
  const [loadError, setLoadError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [chosen, setChosen] = useState<InstallPath | undefined>(() => readPath(website.id));

  useEffect(() => {
    setIntegration(undefined);
    setLoadError(false);
    let cancelled = false;
    getSnippet(projectId, website.id)
      .then((value) => {
        if (!cancelled) setIntegration(value);
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, website.id, attempt]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  const hub = hrefFor('manage/websites/:id', website.id);
  const modes = integration ? modesOf(integration) : undefined;
  const githubAvailable = !!modes?.dynamicMode;
  // With only one option offered, use it; otherwise the remembered choice, else the recommended.
  const path: InstallPath = !githubAvailable ? 'snippet' : (chosen ?? RECOMMENDED_PATH);

  function choose(next: InstallPath) {
    setChosen(next);
    writePath(website.id, next);
  }

  return (
    <div className="page install-page" data-page="install">
      <PageHeader
        crumbs={[
          ...(project ? [{ label: project.name }] : []),
          { label: 'Websites', href: hrefFor('manage/websites') },
          { label: website.name, href: hub },
          { label: 'Install' }
        ]}
        back={{ label: `Back to ${website.name}`, href: hub }}
        title={`Install on ${website.name}`}
        description="Add the code, deploy, then check that data arrives."
      />
      <FlashMessage />
      {website.status === 'disabled' && (
        <p className="notice" role="status">
          This website is disabled. You can install it now, but it will not collect until you enable
          it on <a href={hub}>its page</a>.
        </p>
      )}
      {loadError && (
        <p className="notice error" role="alert">
          Installation details are temporarily unavailable.{' '}
          <button className="link-button" type="button" onClick={retry}>
            Try again
          </button>
        </p>
      )}
      {!integration && !loadError && (
        <p className="metric-empty" aria-busy="true">
          Loading installation details…
        </p>
      )}

      {integration && modes && (
        <>
          <section className="install-choice" aria-labelledby="install-choice-heading">
            <h2 id="install-choice-heading">How is this website deployed?</h2>
            <Tabs<InstallPath>
              label="Deployment path"
              variant="cards"
              value={path}
              onChange={choose}
              items={[
                {
                  id: 'github',
                  label: 'GitHub → Cloudflare Pages',
                  disabled: !githubAvailable,
                  content: (
                    <PathCard
                      title="GitHub → Cloudflare Pages"
                      badge="Recommended"
                      text="Push to deploy. A workflow ships your site with the analytics settings, so nothing private is committed."
                      technical="Uses dynamic configuration"
                      {...(githubAvailable
                        ? {}
                        : {
                            unavailable:
                              'Not available: the local API did not offer this option. Update Vizoalica and restart the console.'
                          })}
                    />
                  )
                },
                {
                  id: 'snippet',
                  label: 'Paste a snippet',
                  content: (
                    <PathCard
                      title="Paste a snippet"
                      text="Add one script tag to your pages yourself. Works with any host, and you provide the token endpoint."
                      technical="Uses a static snippet"
                    />
                  )
                }
              ]}
            >
              <p className="one-path">
                Use one path per website, so analytics starts only once. Browser settings here are
                public; signing and deployment secrets stay on your servers.
              </p>
              {path === 'github' && modes.dynamicMode ? (
                <GithubPath website={website} dynamic={modes.dynamicMode} />
              ) : (
                <SnippetPath
                  website={website}
                  projectId={projectId}
                  staticCode={modes.staticCode}
                  dynamic={modes.dynamicMode}
                />
              )}
            </Tabs>
          </section>

          {path === 'github' && (
            <details className="install-more">
              <summary>Identifiers for this website</summary>
              <IdentifierList items={identifiersFor(projectId, website)} />
            </details>
          )}
        </>
      )}
    </div>
  );
}

export function InstallPage({ websiteId }: { websiteId: string }) {
  return (
    <WebsiteGate websiteId={websiteId}>{(website) => <Install website={website} />}</WebsiteGate>
  );
}
