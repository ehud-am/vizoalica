/** Turns what Wrangler or Cloudflare printed into what happened and what to do; never echoes a credential. */
export function explain(output: string, step: string): string | undefined {
  const text = output.replace(/\u001b\[[0-9;]*m/g, '');
  if (/spawn (npm|onecli)|ENOENT/i.test(text))
    return 'A program this command needs was not found. Check that `npm` (and `onecli`, if used) are installed and on your PATH.';
  if (/9109|not allowed to access|ip address/i.test(text))
    return "Cloudflare blocked this computer's address: the API token is limited to certain IP addresses. Edit the token in Cloudflare → My Profile → API Tokens.";
  if (/10042|r2.*(not|isn't).*enabled|enable r2/i.test(text))
    return 'R2 is not enabled on this Cloudflare account. Open the Cloudflare dashboard → R2 Object Storage, activate it, then run this again with --resume.';
  if (
    /invalid api token|9103|10000|authentication error|unknown x-auth|not logged in|no accounts/i.test(
      text
    )
  )
    return 'Cloudflare did not accept the credential. Check it is a current API token with these permissions: Workers Scripts: Edit, D1: Edit, Workers R2 Storage: Edit, and Account Settings: Read.';
  if (/permission|forbidden|10001|403/i.test(text))
    return `Cloudflare accepted the token but refused the "${step}" step. Add the missing permission (Workers Scripts, D1, and R2 Storage: Edit; Account Settings: Read).`;
  if (/ENOTFOUND|ECONNREFUSED|fetch failed|network|timed out|ETIMEDOUT/i.test(text))
    return 'Cloudflare could not be reached. Check this computer is online and that a VPN or proxy is not blocking api.cloudflare.com.';
  return undefined;
}
