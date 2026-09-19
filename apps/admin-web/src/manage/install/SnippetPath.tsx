import type { DynamicInstallation, Website } from '../../api/local-operations.js';
import { CodeBlock } from '../../components/CodeBlock.js';
import { IdentifierList, identifiersFor } from '../../components/IdentifierList.js';
import { InstallCheck } from './InstallCheck.js';
import { InstallStep, InstallSteps } from './InstallSteps.js';
import { GUIDE_URL } from './paths.js';

/**
 * Paste a snippet: one script tag in your pages, plus an SDK file and a token endpoint that you
 * host. Works with any host. Uses a static snippet.
 */
export function SnippetPath({
  website,
  projectId,
  staticCode,
  dynamic
}: {
  website: Website;
  projectId: string;
  staticCode: string;
  dynamic: DynamicInstallation | undefined;
}) {
  return (
    <>
      <InstallSteps label="Steps for pasting a snippet">
        <InstallStep title="Add the snippet to your pages">
          <p>
            Paste it before <code>&lt;/body&gt;</code> on every page, or once in a shared layout.
            Load it only after your consent banner grants analytics.
          </p>
          <CodeBlock label="Snippet" code={staticCode} what="snippet" />
        </InstallStep>

        <InstallStep title="Host the SDK and a token endpoint">
          <p>
            The snippet loads <code>/vizoalica.js</code> from your site and asks an endpoint on your
            site, <code>/vizoalica/ingest-token</code>, for a short-lived token. You provide both.
            The endpoint signs tokens with <code>VIZOALICA_TOKEN_SECRET</code>, the same secret as
            your backend. Keep it on the server; never put it in a page.
          </p>
          <IdentifierList items={identifiersFor(projectId, website)} />
          <p className="hint">
            These identifiers are public. See the{' '}
            <a href={GUIDE_URL} target="_blank" rel="noopener noreferrer">
              full activation guide
            </a>{' '}
            for the SDK file and an example endpoint.
          </p>
        </InstallStep>

        <InstallStep title="Deploy your website">
          <p>Publish your site the way you normally do.</p>
        </InstallStep>

        <InstallStep title="Check that it works">
          <InstallCheck website={website} path="snippet" />
        </InstallStep>
      </InstallSteps>

      {dynamic && (
        <details className="install-more">
          <summary>Using another host, or keeping settings out of your pages?</summary>
          <p>
            Use the generic loader instead of the snippet above. It is the same for every website
            and reads its settings from a JSON file your host serves at{' '}
            <code>{dynamic.configUrl}</code>.
          </p>
          <CodeBlock label="Generic loader tag" code={dynamic.snippet} what="generic loader tag" />
          <CodeBlock
            label={`Configuration document for ${dynamic.configUrl}`}
            code={JSON.stringify(dynamic.config, null, 2)}
            what="configuration document"
          />
          <p className="hint">
            These values are public browser configuration, not secrets. Use either the generic
            loader or the snippet, not both.
          </p>
        </details>
      )}
    </>
  );
}
