/**
 * Turns what Wrangler, OneCLI, or the network printed into something an administrator can act on: a
 * short title, what happened in plain words, and ordered steps to fix it. Matching is by the codes and
 * phrases those tools print, most specific first; anything unrecognized returns undefined so the caller
 * can show the raw last lines instead of guessing.
 */
export type IssueCode =
  | 'no_credential'
  | 'onecli_settings_missing'
  | 'not_signed_in'
  | 'ip_not_allowed'
  | 'token_invalid'
  | 'permission_missing'
  | 'r2_not_enabled'
  | 'onecli_not_installed'
  | 'onecli_gateway_unreachable'
  | 'onecli_rejected'
  | 'tool_unavailable'
  | 'network_unreachable'
  | 'worker_unhealthy'
  | 'deploy_files_missing';

export type Issue = {
  code: IssueCode;
  title: string;
  detail: string;
  /** What to do, in order. The last step always says how to continue. */
  steps: string[];
  /** Set when the Cloudflare credential form can fix this here, without leaving the console. */
  fix?: 'credential';
};

export type DiagnoseContext = {
  /** How this environment reaches Cloudflare; changes where the fix is made. */
  mode?: 'token' | 'onecli' | undefined;
  /** The deploy step that was running (or 'preflight'), to name the permission that was missing. */
  step?: string;
};

// The D1/R2/Workers permission each step needs, named as the Cloudflare dashboard names them.
const PERMISSION_FOR_STEP: Record<string, string> = {
  'create-database': 'Account → D1 → Edit',
  'create-tables': 'Account → D1 → Edit',
  'create-bucket': 'Account → Workers R2 Storage → Edit',
  'deploy-worker': 'Account → Workers Scripts → Edit',
  'store-secrets': 'Account → Workers Scripts → Edit',
  detect: 'Account → D1 → Read and Account → Workers R2 Storage → Read'
};
const ALL_PERMISSIONS =
  'Account → D1 → Edit, Account → Workers R2 Storage → Edit, and Account → Workers Scripts → Edit';

const clean = (text: string): string => text.replace(/\u001b\[[0-9;]*m/g, '');

const continueStep = 'Come back here and choose Check again (or Resume) — nothing is repeated.';

function whereTokenLives(mode: DiagnoseContext['mode']): string {
  return mode === 'onecli'
    ? 'the token OneCLI injects for your deploy agent (edit the token in Cloudflare; if you replaced it, update the secret in the OneCLI dashboard)'
    : 'the API token saved for this environment (edit it in Cloudflare, or save a new one below)';
}

export function deployFilesMissingIssue(): Issue {
  return {
    code: 'deploy_files_missing',
    title: 'This console does not have the files it deploys with',
    detail:
      'Deploying a backend needs the packaged Worker and database files. This console was started without them, which happens when the API is run from a source checkout that has not been built.',
    steps: [
      'From a source checkout, run `pnpm package:build`, then stop this console (Ctrl+C) and start it again.',
      'Or run the packaged console instead: `npx vizoalica console`.',
      'Come back here and choose Check again.'
    ]
  };
}

export function noCredentialIssue(): Issue {
  return {
    code: 'no_credential',
    title: 'This environment has no Cloudflare credential',
    detail:
      'The console needs a Cloudflare API token, or OneCLI, to create the backend. None is saved for this environment.',
    steps: ['Choose how to reach Cloudflare below and save it.', continueStep],
    fix: 'credential'
  };
}

export function onecliSettingsMissingIssue(): Issue {
  return {
    code: 'onecli_settings_missing',
    title: 'OneCLI settings are missing on this computer',
    detail:
      'This environment uses OneCLI for Cloudflare, but the OneCLI project, agent, and gateway are not saved on this computer.',
    steps: ['Enter the OneCLI project, agent, and gateway below and save them.', continueStep],
    fix: 'credential'
  };
}

export function workerUnhealthyIssue(workerUrl: string): Issue {
  return {
    code: 'worker_unhealthy',
    title: 'The new Worker did not answer its health check',
    detail: `The Worker deployed at ${workerUrl}, but /healthz did not answer OK after several tries. It can take a minute for a new workers.dev address to resolve.`,
    steps: [
      `Open ${workerUrl}/healthz in a browser; a healthy Worker returns {"ok":true}.`,
      'If it does not resolve yet, wait a minute. If it returns an error, open the Worker in the Cloudflare dashboard → Workers & Pages → Logs.',
      continueStep
    ]
  };
}

/** The whoami/list output did not show an account; used when nothing more specific matched. */
export function notSignedInIssue(context: DiagnoseContext, output = ''): Issue {
  const lines = clean(output).trim().split('\n').filter(Boolean).slice(-3).join(' ');
  return {
    code: 'not_signed_in',
    title: "Cloudflare did not recognize this environment's credential",
    detail: lines
      ? `Cloudflare answered: ${lines}`
      : 'Cloudflare did not return an account for this credential.',
    steps: [
      `Check ${whereTokenLives(context.mode)}.`,
      'Confirm the token is active (not expired or deleted) and is for the right account.',
      continueStep
    ],
    fix: 'credential'
  };
}

export function diagnose(output: string, context: DiagnoseContext = {}): Issue | undefined {
  const text = clean(output);
  const lower = text.toLowerCase();

  // The token works but is restricted to other IP addresses (Cloudflare "Client IP Address Filtering").
  if (/\b9109\b|cannot use the access token from location/i.test(text)) {
    const address = /from location:\s*([0-9a-f.:]+)/i.exec(text)?.[1];
    return {
      code: 'ip_not_allowed',
      title: "Cloudflare blocked this computer's address",
      detail: `The API token is limited to certain IP addresses, and ${address ? `this computer's address (${address})` : "this computer's address"} is not on its list. Cloudflare error 9109.`,
      steps: [
        'Open the Cloudflare dashboard → My Profile → API Tokens, and edit the token used for this environment.',
        `Under Client IP Address Filtering, ${address ? `add ${address}` : 'add this computer’s address'}, or remove the filter. A home connection's address can change, so a filter may need updating again.`,
        'Save the token.',
        continueStep
      ]
    };
  }

  if (/r2.*not (been )?enabled|enable r2|\b10042\b|please enable r2/i.test(text)) {
    return {
      code: 'r2_not_enabled',
      title: 'R2 is not enabled on this Cloudflare account',
      detail: 'Creating the storage bucket needs R2, which has not been activated for the account.',
      steps: [
        'Open the Cloudflare dashboard → R2 Object Storage.',
        'Activate R2 (Cloudflare may ask for a payment method; the free allowance usually covers small installs).',
        continueStep
      ]
    };
  }

  // OneCLI problems come before the generic network ones: a refused connection to the gateway is not "offline".
  if (
    /spawn onecli|onecli: command not found|onecli.*enoent|enoent.*onecli|onecli could not be started/i.test(
      text
    )
  ) {
    return {
      code: 'onecli_not_installed',
      title: 'OneCLI could not be started',
      detail:
        'This environment reaches Cloudflare through OneCLI, but the onecli command was not found.',
      steps: [
        'Install OneCLI, and make sure `onecli` runs in a terminal (`which onecli`).',
        'If it is installed somewhere unusual, add its folder to your PATH and restart the console.',
        'Or switch this environment to an API token below.',
        continueStep
      ],
      fix: 'credential'
    };
  }
  if (
    /econnrefused[^\n]*(10255|gateway)|gateway[^\n]*(econnrefused|refused|not running|unreachable|could not connect)|could not (connect|reach) (to )?(the )?(onecli )?gateway/i.test(
      text
    )
  ) {
    return {
      code: 'onecli_gateway_unreachable',
      title: 'The OneCLI gateway is not reachable',
      detail:
        'OneCLI is installed, but its gateway is not answering, so it cannot add the Cloudflare token.',
      steps: [
        'Start OneCLI (its gateway must be running), and check the gateway address saved for this computer.',
        'Run `onecli run --project <project> --agent <agent> --gateway <gateway> -- true` in a terminal; it should print that the gateway connected.',
        continueStep
      ],
      fix: 'credential'
    };
  }
  if (
    /(agent|project)[^\n]*(not found|unknown|does not exist|invalid)|no such (agent|project)|unauthorized agent|agent[^\n]*(not allowed|denied)/i.test(
      text
    )
  ) {
    return {
      code: 'onecli_rejected',
      title: 'OneCLI does not accept this project or agent',
      detail:
        'OneCLI answered, but the saved project or agent name is not one it recognizes for this gateway.',
      steps: [
        'In the OneCLI dashboard, check the exact project slug and agent identifier.',
        'Save the corrected project, agent, and gateway below.',
        continueStep
      ],
      fix: 'credential'
    };
  }

  // The token itself is unknown, expired, or malformed.
  if (
    /invalid (api|access) token|invalid request headers|\b(9106|9103|6003|6111|10001)\b|token (has )?expired|expired token|authentication failed \(status: 401\)|unable to authenticate request/i.test(
      text
    ) ||
    (/\b401\b/.test(text) && /unauthorized|authentication/i.test(lower))
  ) {
    return {
      code: 'token_invalid',
      title: 'Cloudflare does not accept this API token',
      detail: 'The token is unknown to Cloudflare, expired, or was pasted incompletely.',
      steps: [
        `Check ${whereTokenLives(context.mode)}.`,
        `Create a new token in Cloudflare → My Profile → API Tokens if needed. It needs ${ALL_PERMISSIONS}.`,
        continueStep
      ],
      fix: 'credential'
    };
  }

  // The token is valid but not allowed to do this.
  if (
    /\b10000\b|authentication error|not authorized|forbidden|permission|\b10023\b|requires the following|access denied|does not have access/i.test(
      text
    )
  ) {
    const needed = (context.step && PERMISSION_FOR_STEP[context.step]) || ALL_PERMISSIONS;
    return {
      code: 'permission_missing',
      title: 'The API token is missing a permission',
      detail: `Cloudflare accepted the token but refused this action. It needs: ${needed}.`,
      steps: [
        'Open the Cloudflare dashboard → My Profile → API Tokens and edit the token used for this environment.',
        `Add the permission: ${needed}. The account resources must include the account you are deploying to.`,
        'Save the token (its value does not change when you edit permissions).',
        continueStep
      ]
    };
  }

  if (
    /npm (err|error)|\be404\b|enotfound[^\n]*(registry|npmjs)|eai_again[^\n]*(registry|npmjs)|could not be prepared|npx canceled|command not found: (npm|node)|spawn npm/i.test(
      text
    )
  ) {
    return {
      code: 'tool_unavailable',
      title: 'The deployment tool could not be prepared',
      detail:
        'The console downloads a pinned Wrangler with npm the first time it deploys, and that did not complete.',
      steps: [
        'Check this computer is online and can reach registry.npmjs.org.',
        'Check `npm --version` works in a terminal, and that Node is version 22 or newer.',
        'If npm is behind a proxy or private registry, configure it for npm and restart the console.',
        continueStep
      ]
    };
  }

  if (
    /fetch failed|enotfound|econnreset|etimedout|eai_again|econnrefused|network (error|is unreachable)|socket hang up|timed out/i.test(
      text
    )
  ) {
    return {
      code: 'network_unreachable',
      title: 'Cloudflare could not be reached',
      detail:
        'The request to Cloudflare did not complete, so the console cannot tell what state things are in.',
      steps: [
        'Check this computer is online, and that a VPN or proxy is not blocking api.cloudflare.com.',
        'Check status at cloudflarestatus.com if it keeps failing.',
        continueStep
      ]
    };
  }

  return undefined;
}
