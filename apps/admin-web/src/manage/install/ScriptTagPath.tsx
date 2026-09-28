import type { Website } from '../../api/local-operations.js';
import { CodeBlock } from '../../components/CodeBlock.js';
import { hrefFor } from '../../router.js';
import { DeployedButton } from './DeployedButton.js';
import { InstallCheck } from './InstallCheck.js';
import { InstallStep, InstallSteps } from './InstallSteps.js';

/**
 * A static website: one script tag, nothing else on the site. Your backend serves the SDK and
 * accepts events only from the website's allowed origins, so there is no file to save and no token
 * endpoint to run.
 */
export function ScriptTagPath({
  website,
  snippet,
  runSignal,
  onDeployed
}: {
  website: Website;
  snippet: string;
  runSignal: number;
  onDeployed: () => void;
}) {
  return (
    <>
      <InstallSteps label="Steps for a static website">
        <InstallStep title="Add the script tag to your pages">
          <p>
            Paste it before <code>&lt;/body&gt;</code> on every page, or once in a shared layout or
            theme. It works on any host: GitHub Pages, Netlify, WordPress, or plain HTML files.
          </p>
          <CodeBlock label="Script tag" code={snippet} what="script tag" />
          <p className="hint">
            The tag holds only public values. Vizoalica stores nothing in your visitors’ browsers:
            it counts unique visitors with an identifier that changes every day.
          </p>
        </InstallStep>

        <InstallStep title="Publish your website">
          <p>Publish your site the way you normally do.</p>
          <DeployedButton onDeployed={onDeployed} />
        </InstallStep>

        <InstallStep title="Check that it works">
          <InstallCheck website={website} path="script-tag" runSignal={runSignal} />
        </InstallStep>
      </InstallSteps>
      <p className="hint">
        Want signed tokens instead? Turn on{' '}
        <a href={hrefFor('manage/websites/:id/edit', website.id)}>Require a signed token</a> for
        this website, then come back here.
      </p>
    </>
  );
}
