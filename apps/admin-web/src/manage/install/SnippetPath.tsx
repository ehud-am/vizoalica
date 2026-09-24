import type { DynamicInstallation, Website } from '../../api/local-operations.js';
import { CodeBlock } from '../../components/CodeBlock.js';
import { IdentifierList, identifiersFor } from '../../components/IdentifierList.js';
import { InstallCheck } from './InstallCheck.js';
import { InstallStep, InstallSteps } from './InstallSteps.js';
import { GUIDE_URL } from './paths.js';

/** A same-origin link to one of the SDK files this console ships, saved under its own name. */
function SdkDownload({ file }: { file: 'vizoalica.js' | 'vizoalica-loader.js' }) {
  return (
    <p>
      <a className="button secondary" href={`/api/sdk/${file}`} download={file}>
        Download {file}
      </a>
    </p>
  );
}

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

        <InstallStep title="Save the SDK file on your site">
          <p>
            The snippet loads <code>/vizoalica.js</code> from your own site. Download the file and
            save it in your website&rsquo;s root folder, the one that holds your{' '}
            <code>index.html</code> (in a framework with a <code>public</code> folder, put it
            there), so it is served at <code>/vizoalica.js</code>.
          </p>
          <SdkDownload file="vizoalica.js" />
          <p className="hint">
            It is a single file with no dependencies. Download it again when you update Vizoalica.
          </p>
        </InstallStep>

        <InstallStep title="Add a token endpoint">
          <p>
            The snippet asks an endpoint on your site, <code>/vizoalica/ingest-token</code>, for a
            short-lived token. You provide it. It signs tokens with{' '}
            <code>VIZOALICA_TOKEN_SECRET</code>, the same secret as your backend. Keep it on the
            server; never put it in a page.
          </p>
          <IdentifierList items={identifiersFor(projectId, website)} />
          <p className="hint">
            These identifiers are public. See the{' '}
            <a href={GUIDE_URL} target="_blank" rel="noopener noreferrer">
              full activation guide
            </a>{' '}
            for an example endpoint.
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
          <p>
            The loader is its own file. Download it and save it next to <code>vizoalica.js</code> in
            your website&rsquo;s root folder, so it is served at <code>/vizoalica-loader.js</code>.
            Then have your host serve the configuration below at <code>{dynamic.configUrl}</code>.
            The loader adds the SDK from its <code>src</code> value, so <code>vizoalica.js</code>{' '}
            must be there too.
          </p>
          <SdkDownload file="vizoalica-loader.js" />
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
