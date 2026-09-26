/**
 * Turns what a person pastes (a page address, a bare domain, a browser-bar copy) into the exact
 * origin the service stores: scheme and host, plus a port only when it is not the default. The
 * service keeps its own validation as the authority; this only makes the common cases painless
 * and lets the form show the result before anything is saved.
 */
interface NormalizedOrigin {
  origin?: string;
  /** What to type instead, when the input cannot be turned into an origin. */
  error?: string;
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

export function normalizeOrigin(input: string): NormalizedOrigin {
  const text = input.trim();
  if (!text) return { error: 'Enter your website’s address, like example.com.' };
  // A scheme is "letters then ://"; anything else (a bare domain, or host:port) gets https.
  const scheme = /^([a-z][a-z0-9+.-]*):\/\//i.exec(text)?.[1]?.toLowerCase();
  if (scheme && scheme !== 'http' && scheme !== 'https')
    return {
      error: `“${scheme}://” addresses cannot be measured. Use the address people open in a browser, like https://example.com.`
    };
  let url: URL;
  try {
    url = new URL(scheme ? text : `https://${text}`);
  } catch {
    return { error: `“${text}” is not an address. Use something like example.com.` };
  }
  // URL already turns an international name into ASCII; what is left must look like a host.
  if (
    !/^([a-z0-9-]+\.)*[a-z0-9-]+$|^\[[0-9a-f:]+\]$/i.test(url.hostname) ||
    url.username ||
    url.password
  )
    return { error: `“${text}” is not an address. Use something like example.com.` };
  return { origin: url.origin };
}

/** Whether a website served from an http address other than this machine can be saved. */
export const isInsecureRemote = (origin: string): boolean => {
  try {
    const url = new URL(origin);
    return url.protocol === 'http:' && !LOCAL_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
};

/**
 * The other spelling of the same site: `www.example.com` for `example.com` and the reverse. Only for
 * ordinary domains: a host with more than one extra label (a subdomain), an address, or localhost
 * has no counterpart worth guessing.
 */
export function wwwCounterpart(origin: string): string | undefined {
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return undefined;
  }
  const host = url.hostname;
  if (LOCAL_HOSTS.has(host) || /^[\d.]+$/.test(host) || host.startsWith('[')) return undefined;
  const bare = host.startsWith('www.') ? host.slice(4) : host;
  // A registrable-looking domain has at least one dot; more labels than that is a subdomain.
  const labels = bare.split('.');
  if (labels.length < 2 || (host === bare && labels.length > 2 && !isTwoPartSuffix(labels)))
    return undefined;
  const counterpart = host === bare ? `www.${bare}` : bare;
  return `${url.protocol}//${counterpart}${url.port ? `:${url.port}` : ''}`;
}

// Common two-part public suffixes, so `example.co.uk` still counts as one bare domain.
const isTwoPartSuffix = (labels: string[]): boolean =>
  labels.length === 3 && /^(co|com|org|net|gov|ac|edu)$/.test(labels[1]!);

/** The domain to name a website after: the host of its first origin, without a leading www. */
export function nameFromOrigin(origin: string): string {
  try {
    return new URL(origin).host.replace(/^www\./, '');
  } catch {
    return origin;
  }
}
