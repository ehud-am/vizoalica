import { randomBytes } from 'node:crypto';

/** The three Worker secrets, and what each one is for. */
export const SECRETS = {
  admin: {
    name: 'VIZOALICA_ADMIN_SECRET',
    purpose: 'lets an operator administer projects and read analytics (the console uses it)'
  },
  token: {
    name: 'VIZOALICA_TOKEN_SECRET',
    purpose: "signs the short-lived tokens your website's token endpoint hands to browsers"
  },
  digest: {
    name: 'VIZOALICA_ANALYTICS_DIGEST_SECRET',
    purpose: 'makes visitor identifiers non-reversible; used by the Worker only'
  }
} as const;

export type SecretKind = keyof typeof SECRETS;
export type SecretName = (typeof SECRETS)[SecretKind]['name'];
export const SECRET_KINDS = Object.keys(SECRETS) as SecretKind[];

/** 256 random bits as 43 unpadded base64url characters. */
export const generateSecret = (): string => randomBytes(32).toString('base64url');

export function generateSecrets(
  kinds: readonly SecretKind[] = SECRET_KINDS
): Record<string, string> {
  return Object.fromEntries(kinds.map((kind) => [SECRETS[kind].name, generateSecret()]));
}

/** What the Worker and the token endpoint accept: 32+ printable characters, no whitespace. */
export function isValidSecret(value: string): boolean {
  return value.length >= 32 && value.length <= 256 && /^[\x21-\x7e]+$/.test(value);
}

export function parseSecretKind(value: string | undefined): SecretKind | 'all' | undefined {
  if (value === 'all') return 'all';
  return value !== undefined && value in SECRETS ? (value as SecretKind) : undefined;
}

/** A framed block the operator must copy into a password manager. Shown once, stored nowhere. */
export function formatSecretBlock(secrets: Record<string, string>): string {
  const rule = '═'.repeat(72);
  const entries = SECRET_KINDS.filter((kind) => secrets[SECRETS[kind].name] !== undefined).map(
    (kind) =>
      `${SECRETS[kind].name}\n  ${secrets[SECRETS[kind].name]}\n  → ${SECRETS[kind].purpose}`
  );
  return [
    rule,
    'SAVE THESE NOW. They are shown once and Vizoalica does not store them.',
    rule,
    '',
    entries.join('\n\n'),
    '',
    rule,
    'Put each one in your password manager under the exact name above.',
    'Without them you cannot add another operator or a website later.',
    rule
  ].join('\n');
}
