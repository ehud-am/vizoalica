import { useState } from 'react';
import type { DynamicInstallation, Website } from '../../api/local-operations.js';
import { CodeBlock } from '../../components/CodeBlock.js';
import { Tabs } from '../../components/Tabs.js';
import { InstallCheck } from './InstallCheck.js';
import { InstallStep, InstallSteps } from './InstallSteps.js';

type How = 'web' | 'cli';

const WHERE: Record<string, string> = {
  CF_ACCOUNT_ID: 'Your Cloudflare account ID',
  CF_PAGES_PROJECT: 'The name of your Cloudflare Pages project',
  CF_API_TOKEN: 'A Cloudflare API token limited to “Cloudflare Pages: Edit” on this account',
  VIZOALICA_TOKEN_SECRET:
    'The token secret you saved during backend setup (the same one the Worker uses)'
};

/**
 * GitHub → Cloudflare Pages: a push deploys the site with the analytics settings taken from
 * repository variables and secrets, so nothing private is committed. Uses dynamic configuration.
 */
export function GithubPath({
  website,
  dynamic
}: {
  website: Website;
  dynamic: DynamicInstallation;
}) {
  const [how, setHow] = useState<How>('web');
  const { cloudflare } = dynamic;
  const variables = Object.entries(cloudflare.repoVariables)
    .map(([name, value]) => `${name}=${value}`)
    .join('\n');
  // The one-path rule is stated once, above the steps, so it is not repeated as a warning here.
  // Two of the service's warnings are already said by the page itself: the one-path rule (above
  // the steps) and "public variables are not secrets" (in the settings step).
  const warnings = cloudflare.warnings.filter(
    (warning) =>
      !/only one installation mode/i.test(warning) &&
      !/^The listed repository variables/i.test(warning)
  );
  const rows = [
    ...cloudflare.accountSpecificVariables.map((name) => ({ name, kind: 'Variable' })),
    ...cloudflare.repoSecretNames.map((name) => ({ name, kind: 'Secret' }))
  ];

  return (
    <InstallSteps label="Steps for GitHub and Cloudflare Pages">
      <InstallStep title="Add the loader to your pages">
        <p>
          Paste this once into a shared layout so it appears on every page. Load it only after your
          consent banner grants analytics.
        </p>
        <CodeBlock label="Loader tag" code={dynamic.snippet} what="loader tag" />
      </InstallStep>

      <InstallStep title="Add the deploy workflow">
        <p>
          Save this as <code>.github/workflows/deploy-website.yml</code> in your website’s
          repository, replacing <code>YOUR_SITE_DIRECTORY</code> with your site’s folder.
        </p>
        <CodeBlock
          label="Deploy workflow"
          code={cloudflare.starterWorkflowYaml}
          what="workflow file"
        />
      </InstallStep>

      <InstallStep title="Add the settings and secrets to the repository">
        <Tabs
          label="How to add them"
          value={how}
          onChange={setHow}
          items={[
            { id: 'web', label: 'In GitHub' },
            { id: 'cli', label: 'With the gh command' }
          ]}
        >
          {how === 'web' ? (
            <>
              <p>
                In the repository, open Settings → Secrets and variables → Actions. Add these public
                variables. They are browser configuration, not secrets.
              </p>
              <CodeBlock label="Repository variables" code={variables} what="variable list" />
              <p>Then add these yourself, using your own Cloudflare account details:</p>
              <ul className="settings-list" aria-label="Other settings to add">
                {rows.map((row) => (
                  <li key={row.name}>
                    <span className="setting-head">
                      <code>{row.name}</code>
                      <span className={`kind ${row.kind.toLowerCase()}`}>{row.kind}</span>
                    </span>
                    <span className="setting-source">{WHERE[row.name] ?? 'Your own value'}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <>
              <p>
                Run these in your website’s repository. The two <code>gh secret set</code> commands
                ask for the value, so it never appears in your shell history.
              </p>
              <CodeBlock
                label="gh commands"
                code={cloudflare.setupCommands.join('\n')}
                what="gh commands"
              />
            </>
          )}
        </Tabs>
        {warnings.length > 0 && (
          <ul className="integration-warnings">
            {warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        )}
      </InstallStep>

      <InstallStep title="Push to deploy">
        <p>
          Push to your main branch. The workflow deploys your site to Cloudflare Pages together with
          Vizoalica’s loader, its configuration file (<code>{dynamic.configUrl}</code>), and the
          token endpoint.
        </p>
      </InstallStep>

      <InstallStep title="Check that it works">
        <InstallCheck website={website} path="github" />
      </InstallStep>
    </InstallSteps>
  );
}
