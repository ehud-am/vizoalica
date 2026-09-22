const ID_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
const ID_LENGTH = 12;
const SECRET_BYTES = 32;
const KEY_PATTERN = /^vzk_([a-z0-9]{12})_([A-Za-z0-9_-]{43})$/;

export type ParsedAccessKey = { id: string; secret: string };
export type GeneratedAccessKey = { key: string; id: string; secretHash: string };

function randomId(): string {
  const bytes = new Uint8Array(ID_LENGTH);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => ID_ALPHABET[byte % ID_ALPHABET.length]).join('');
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** 256 bits of entropy from a cryptographic source, as 43 base64url characters. */
function randomSecret(): string {
  const bytes = new Uint8Array(SECRET_BYTES);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

export async function hashSecret(secret: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Fixed-length comparison of two hex digests, so a wrong guess never reveals how much it matched. */
function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index += 1)
    diff |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return diff === 0;
}

/** `vzk_<id>_<secret>`. The id is public (it appears in lists); only the secret's hash is stored. */
export async function generateAccessKey(): Promise<GeneratedAccessKey> {
  const id = randomId();
  const secret = randomSecret();
  return { key: `vzk_${id}_${secret}`, id, secretHash: await hashSecret(secret) };
}

export function parseAccessKey(value: string): ParsedAccessKey | undefined {
  const match = KEY_PATTERN.exec(value);
  return match ? { id: match[1]!, secret: match[2]! } : undefined;
}

/** Whether `secret` is the one that produced `hash`, checked in constant time. */
export async function verifySecret(secret: string, hash: string): Promise<boolean> {
  return timingSafeEqualHex(await hashSecret(secret), hash);
}
