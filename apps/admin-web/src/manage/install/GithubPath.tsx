import { useState, type ReactNode } from 'react';
import type { DynamicInstallation, Website } from '../../api/local-operations.js';
import { CodeBlock } from '../../components/CodeBlock.js';
import { Tabs } from '../../components/Tabs.js';
import { DeployedButton } from './DeployedButton.js';
import { InstallCheck } from './InstallCheck.js';
import { InstallStep, InstallSteps } from './InstallSteps.js';

type How = 'web' | 'cli';

/** Where each value you add yourself comes from, step by step. */
const WHERE: Record<string, ReactNode> = {
  CF_ACCOUNT_ID: (
    <>
      Your Cloudflare account ID, 32 letters and digits. Run the command below the list: it prints
      it, and it is also the code in the dashboard address right after{' '}
      <code>dash.cloudflare.com/</code>.
    </>
  ),
  CF_PAGES_PROJECT: (
    <>
      The name of the Cloudflare Pages project your website deploys to, as the same command lists it
      (its address is <code>NAME.pages.dev</code>). It must already exist; if it does not, create it
      with <code>npx wrangler pages project create NAME</code>.
    </>
  ),
  CF_API_TOKEN: (
    <>
      A new Cloudflare API token that can only deploy Pages: in the dashboard open My Profile → API
      Tokens (<code>dash.cloudflare.com/profile/api-tokens</code>) → Create Token → Custom token,
      add the permission Account → “Cloudflare Pages: Edit”, and limit it to this account.
      Cloudflare shows the token once, so copy it straight into GitHub.
    </>
  ),
  VIZOALICA_TOKEN_SECRET: (
    <>
      The token secret of this environment’s backend (the same one the Worker uses), so it must be
      that exact value. It was shown once when the backend was deployed, as{' '}
      <code>VIZOALICA_TOKEN_SECRET</code>, or written to the file you gave with{' '}
      <code>--secrets-file</code>. Don’t have it? Make a new one with{' '}
      <code>vizoalica rotate ENVIRONMENT token</code>; websites already installed then need the new
      value too.
    </>
  )
};

/** The values you add yourself, each with where to find it. */
function WhereList({ label, rows }: { label: string; rows: { name: string; kind: string }[] }) {
  return (
    <ul className="settings-list" aria-label={label}>
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
  );
}

/**
 * GitHub → Cloudflare Pages: a push deploys the site with the analytics settings taken from
 * repository variables and secrets, so nothing private is committed. Uses dynamic configuration.
 */
export function GithubPath({
  website,
  dynamic,
  runSignal,
  onDeployed
}: {
  website: Website;
  dynamic: DynamicInstallation;
  runSignal: number;
  onDeployed: () => void;
}) {
  const [how, setHow] = useState<How>('web');
  const { cloudflare } = dynamic;
  const asLines = (values: Record<string, string>) =>
    Object.entries(values)
      .map(([name, value]) => `${name}=${value}`)
      .join('\n');
  const variables = asLines(cloudflare.repoVariables);
  const { summary, defaults, expandedRepoVariables } = cloudflare;
  const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;
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

  const steps = (
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
          repository. It works as it is when your site is at the top of the repository. If your site
          is in a folder, add <code>with:</code> and <code>site-directory: YOUR_FOLDER</code> under
          the <code>uses</code> line.
        </p>
        <CodeBlock
          label="Deploy workflow"
          code={cloudflare.starterWorkflowYaml}
          what="workflow file"
        />
      </InstallStep>

      <InstallStep title="Add the settings and secrets to the repository">
        {summary && (
          <p className="install-count">
            You add <strong>{plural(summary.publicValues, 'public value')}</strong> and{' '}
            <strong>{plural(summary.secrets, 'secret')}</strong>. Everything else has a default.
          </p>
        )}
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
                In the repository, open Settings → Secrets and variables → Actions. Add this public
                variable. It is browser configuration, not a secret.
              </p>
              <CodeBlock label="Repository variables" code={variables} what="variable list" />
              <p>Then add these yourself, using your own Cloudflare account details:</p>
              <WhereList label="Other settings to add" rows={rows} />
              {cloudflare.accountLookupCommand && (
                <p className="hint">
                  To find your account ID and Pages project, run{' '}
                  <code>{cloudflare.accountLookupCommand}</code>.
                </p>
              )}
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
              <p>
                Replace <code>YOUR_CF_ACCOUNT_ID</code> and <code>YOUR_CF_PAGES_PROJECT</code> with
                your own values, and paste each secret when <code>gh</code> asks for it.
                {cloudflare.accountLookupCommand && (
                  <>
                    {' '}
                    <code>{cloudflare.accountLookupCommand}</code> prints the first two.
                  </>
                )}{' '}
                Where to find them:
              </p>
              <WhereList label="Where to find each value" rows={rows} />
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
        <DeployedButton onDeployed={onDeployed} />
      </InstallStep>

      <InstallStep title="Check that it works">
        <InstallCheck website={website} path="github" runSignal={runSignal} />
      </InstallStep>
    </InstallSteps>
  );
  return (
    <>
      {steps}
      {defaults && expandedRepoVariables && (
        <details className="install-more">
          <summary>What is assumed, or prefer separate variables?</summary>
          <p>
            These follow a convention, so you do not add them:{' '}
            {Object.entries(defaults).map(([name, value], index) => (
              <span key={name}>
                {index > 0 && ', '}
                <code>{name}</code> = <code>{value}</code>
              </span>
            ))}
            . Set a variable with that name only to change it.
          </p>
          <p>
            You can add the public value above as separate variables instead. They work the same,
            and a separate variable wins over the bundled one.
          </p>
          <CodeBlock
            label="Separate repository variables"
            code={asLines(expandedRepoVariables)}
            what="separate variable list"
          />
        </details>
      )}
    </>
  );
}
