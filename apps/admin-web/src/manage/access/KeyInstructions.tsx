import { useState } from 'react';
import type { AccessKeyRole } from '../../api/local-operations.js';
import { CodeBlock } from '../../components/CodeBlock.js';
import { Tabs } from '../../components/Tabs.js';
import { InstallStep, InstallSteps } from '../install/InstallSteps.js';

type How = 'file' | 'onecli' | 'script';

const ROLE_NAME: Record<AccessKeyRole, string> = { analyst: 'analyst', owner: 'website owner' };

/** A name the person can give the new environment, so it never collides with an admin's own. */
export const suggestedEnvironmentName = (environment: string, role: AccessKeyRole): string =>
  `${environment || 'backend'}-${role}`;

/**
 * What to do with an access key once it exists. Nothing is deployed: the backend accepts the key
 * from the moment it is issued. The person who receives it adds an environment to their own
 * console, keeping the key in a private file or in OneCLI, or from a script. The commands name this
 * backend's address and the key's role; the key itself is never written into them.
 */
export function KeyInstructions({
  workerUrl,
  environment,
  role,
  access
}: {
  workerUrl: string;
  /** The environment the key was issued in, used to suggest a name. */
  environment: string;
  role: AccessKeyRole;
  /** What the key reaches, in words ("Docs in Acme"), when known. */
  access?: string;
}) {
  const [how, setHow] = useState<How>('file');
  const name = suggestedEnvironmentName(environment, role);
  const url = workerUrl || 'https://YOUR_WORKER_ADDRESS';
  const host = url.replace(/^https?:\/\//, '');
  const add = `vizoalica env add ${name} --connect --url ${url} --role ${role}`;
  const check = `vizoalica env check ${name}`;

  const verify = (
    <InstallStep title="Check that it works, then open the console">
      <p>
        This asks the backend whether the key is accepted; it should say the environment works. Then
        start the console and pick <strong>{name}</strong> in the Environment menu at the top.
      </p>
      <CodeBlock label="Check" code={check} what="check command" />
      <p>
        <code>vizoalica console</code> starts the console. As {ROLE_NAME[role]}
        {role === 'analyst'
          ? ' they can see analytics and settings but change nothing.'
          : ' they can manage the websites and projects the key reaches.'}
      </p>
    </InstallStep>
  );

  return (
    <div className="key-instructions">
      <h3>What to do with this key</h3>
      <ul className="key-facts">
        <li>
          <strong>Nothing to deploy.</strong> The backend already accepts the key. It works as soon
          as it is issued, and it can be revoked here at any time.
        </li>
        <li>
          <strong>Send it privately</strong> (a password manager, not chat or email) to the person
          who will use it{access ? `, who then reaches ${access}` : ''}. They need Vizoalica
          installed: <code>npm install -g vizoalica</code>.
        </li>
        <li>
          They add <strong>a new console environment</strong> for this backend with the{' '}
          {ROLE_NAME[role]} role. Pick how they keep the key:
        </li>
      </ul>
      <Tabs<How>
        label="How the key is kept"
        value={how}
        onChange={setHow}
        items={[
          { id: 'file', label: 'In a private file' },
          { id: 'onecli', label: 'In OneCLI' },
          { id: 'script', label: 'From a script' }
        ]}
      >
        {how === 'file' && (
          <InstallSteps label="Steps: keep the key in a private file">
            <InstallStep title="Add the environment">
              <p>
                It asks for the access key: paste it (nothing is shown as you type) and answer{' '}
                <strong>n</strong> when it asks whether OneCLI holds it. The key is saved in{' '}
                <code>~/.config/vizoalica/environments.json</code>, readable only by that person.
              </p>
              <CodeBlock label="Add the environment" code={add} what="add command" />
            </InstallStep>
            {verify}
          </InstallSteps>
        )}
        {how === 'onecli' && (
          <InstallSteps label="Steps: keep the key in OneCLI">
            <InstallStep title="Store the key in OneCLI">
              <p>
                Create a <strong>Generic</strong> secret and attach it only to the agent that will
                use it: host <code>{host}</code>, header <code>Authorization</code>, format{' '}
                <code>Bearer {'{value}'}</code>, value the key. Or from a terminal, with the key in
                a file that you delete afterwards (so it is not left in your shell history):
              </p>
              <CodeBlock
                label="Store the key in OneCLI"
                code={`onecli secrets create --project PROJECT --name "Vizoalica ${ROLE_NAME[role]} key ${name}" --type generic --host-pattern ${host} --header-name Authorization --value-format 'Bearer {value}' --file ./key.txt`}
                what="OneCLI command"
              />
            </InstallStep>
            <InstallStep title="Add the environment, pointing at OneCLI">
              <p>
                Give the workspace, agent and gateway of that OneCLI setup (<code>PROJECT</code>{' '}
                above is the workspace). Vizoalica then keeps only the placeholder{' '}
                <code>onecli-managed</code>: OneCLI adds the real key to requests for this address,
                and the key is never saved on the computer.
              </p>
              <CodeBlock
                label="Add the environment"
                code={`${add} --secret-onecli --onecli-workspace WORKSPACE --onecli-agent AGENT --onecli-gateway 127.0.0.1:10255`}
                what="add command"
              />
            </InstallStep>
            {verify}
          </InstallSteps>
        )}
        {how === 'script' && (
          <InstallSteps label="Steps: add it from a script">
            <InstallStep title="Add the environment without questions">
              <p>
                The key is read from standard input, so it is not in the command line or the shell
                history. <code>read -rs</code> asks for it without showing it; a script can pipe it
                from a secret store instead.
              </p>
              <CodeBlock
                label="Add the environment"
                code={`read -rs KEY && printf '%s' "$KEY" | ${add} --secret-stdin --no-onecli`}
                what="add command"
              />
            </InstallStep>
            {verify}
          </InstallSteps>
        )}
      </Tabs>
    </div>
  );
}
