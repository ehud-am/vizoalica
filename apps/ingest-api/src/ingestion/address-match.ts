/**
 * Internal-traffic exclusion: IP addresses and ranges a website drops instead of counting. An entry
 * is a single IPv4 or IPv6 address, or a CIDR range such as `203.0.113.0/24`. Entries are stored in
 * one canonical spelling so equal entries compare equal and the list shows what is really matched.
 * Pure code with no dependencies; see specs/023-exclude-internal-traffic/data-model.md.
 */

export const MAX_EXCLUDED_ADDRESSES = 25;
export const MAX_ADDRESS_ENTRY_LENGTH = 49;

interface Network {
  version: 4 | 6;
  /** The address with host bits cleared. */
  network: bigint;
  prefix: number;
}

const BITS = { 4: 32, 6: 128 } as const;
const IPV4_OCTET = /^(0|[1-9]\d{0,2})$/;
const HEX_GROUP = /^[0-9a-f]{1,4}$/i;
const PREFIX = /^(0|[1-9]\d{0,2})$/;

function parseIpv4(text: string): bigint | undefined {
  const octets = text.split('.');
  if (octets.length !== 4) return undefined;
  let value = 0n;
  for (const octet of octets) {
    if (!IPV4_OCTET.test(octet) || Number(octet) > 255) return undefined;
    value = (value << 8n) | BigInt(octet);
  }
  return value;
}

function parseIpv6(text: string): bigint | undefined {
  if (!text.includes(':') || text.includes('%')) return undefined;
  const halves = text.split('::');
  if (halves.length > 2) return undefined;
  const groupsOf = (part: string): number[] | undefined => {
    if (part === '') return [];
    const groups: number[] = [];
    const pieces = part.split(':');
    for (const [index, piece] of pieces.entries()) {
      // An IPv4 tail takes the place of the last two groups.
      if (piece.includes('.') && index === pieces.length - 1) {
        const v4 = parseIpv4(piece);
        if (v4 === undefined) return undefined;
        groups.push(Number(v4 >> 16n), Number(v4 & 0xffffn));
      } else if (HEX_GROUP.test(piece)) groups.push(parseInt(piece, 16));
      else return undefined;
    }
    return groups;
  };
  const head = groupsOf(halves[0]!);
  const tail = halves.length === 2 ? groupsOf(halves[1]!) : [];
  if (!head || !tail) return undefined;
  let groups: number[];
  if (halves.length === 2) {
    // `::` stands for at least one group of zeros.
    const missing = 8 - head.length - tail.length;
    if (missing < 1) return undefined;
    groups = [...head, ...Array<number>(missing).fill(0), ...tail];
  } else groups = head;
  if (groups.length !== 8) return undefined;
  return groups.reduce((value, group) => (value << 16n) | BigInt(group), 0n);
}

/** The IPv4 address inside an IPv4-mapped IPv6 address (::ffff:a.b.c.d), if it is one. */
const mappedIpv4 = (value: bigint): bigint | undefined =>
  value >> 32n === 0xffffn ? value & 0xffffffffn : undefined;

function parseNetwork(input: string): Network | undefined {
  const text = input.trim();
  if (!text || text.length > MAX_ADDRESS_ENTRY_LENGTH) return undefined;
  const slash = text.indexOf('/');
  const addressText = slash < 0 ? text : text.slice(0, slash);
  const prefixText = slash < 0 ? undefined : text.slice(slash + 1);
  if (prefixText !== undefined && !PREFIX.test(prefixText)) return undefined;
  const requested = prefixText === undefined ? undefined : Number(prefixText);

  const v4 = parseIpv4(addressText);
  if (v4 !== undefined) return build(4, v4, requested ?? 32);
  const v6 = parseIpv6(addressText.toLowerCase());
  if (v6 === undefined) return undefined;
  const mapped = mappedIpv4(v6);
  if (mapped !== undefined) {
    // A range inside the mapped block is an IPv4 range; a wider one cannot be written as IPv4.
    if (requested === undefined) return build(4, mapped, 32);
    return requested >= 96 ? build(4, mapped, requested - 96) : undefined;
  }
  return build(6, v6, requested ?? 128);
}

function build(version: 4 | 6, address: bigint, prefix: number): Network | undefined {
  const bits = BITS[version];
  if (prefix > bits) return undefined;
  const hostBits = BigInt(bits - prefix);
  return { version, network: (address >> hostBits) << hostBits, prefix };
}

function formatIpv4(value: bigint): string {
  return [24n, 16n, 8n, 0n].map((shift) => String((value >> shift) & 0xffn)).join('.');
}

function formatIpv6(value: bigint): string {
  const groups = Array.from({ length: 8 }, (_, index) =>
    Number((value >> BigInt((7 - index) * 16)) & 0xffffn)
  );
  // The longest run of two or more zero groups becomes `::` (the first one on a tie).
  let best = { start: -1, length: 0 };
  for (let index = 0; index < 8;) {
    if (groups[index] !== 0) {
      index += 1;
      continue;
    }
    let end = index;
    while (end < 8 && groups[end] === 0) end += 1;
    if (end - index > best.length) best = { start: index, length: end - index };
    index = end;
  }
  const hex = (list: number[]) => list.map((group) => group.toString(16)).join(':');
  if (best.length < 2) return hex(groups);
  return `${hex(groups.slice(0, best.start))}::${hex(groups.slice(best.start + best.length))}`;
}

function canonical(network: Network): string {
  const text = network.version === 4 ? formatIpv4(network.network) : formatIpv6(network.network);
  return network.prefix === BITS[network.version] ? text : `${text}/${network.prefix}`;
}

/** The canonical spelling of one entry, or undefined when it is not an address or range. */
export function canonicalAddressEntry(input: unknown): string | undefined {
  if (typeof input !== 'string') return undefined;
  const network = parseNetwork(input);
  return network ? canonical(network) : undefined;
}

export type AddressListResult =
  | { ok: true; entries: string[] }
  | { ok: false; reason: 'not_a_list' | 'too_many' | 'invalid_entry'; index?: number };

/**
 * Validates a whole list. Any bad entry refuses the list (nothing is partly saved); equal entries
 * are kept once.
 */
export function parseAddressList(value: unknown): AddressListResult {
  if (!Array.isArray(value)) return { ok: false, reason: 'not_a_list' };
  if (value.length > MAX_EXCLUDED_ADDRESSES) return { ok: false, reason: 'too_many' };
  const entries: string[] = [];
  for (const [index, item] of value.entries()) {
    const entry = canonicalAddressEntry(item);
    if (entry === undefined) return { ok: false, reason: 'invalid_entry', index };
    if (!entries.includes(entry)) entries.push(entry);
  }
  return { ok: true, entries };
}

/** The client address as one comparable number, or undefined when it is not a usable address. */
function parseClientAddress(input: string): { version: 4 | 6; value: bigint } | undefined {
  const text = input.trim().toLowerCase();
  const v4 = parseIpv4(text);
  if (v4 !== undefined) return { version: 4, value: v4 };
  const v6 = parseIpv6(text);
  if (v6 === undefined) return undefined;
  const mapped = mappedIpv4(v6);
  return mapped !== undefined ? { version: 4, value: mapped } : { version: 6, value: v6 };
}

/**
 * Whether the address is inside any entry. Entries that do not parse (a hand-edited database) are
 * skipped rather than excluding everyone; an unusable address is never excluded.
 */
export function isExcluded(
  address: string | null | undefined,
  entries: readonly string[]
): boolean {
  if (!address || entries.length === 0) return false;
  const client = parseClientAddress(address);
  if (!client) return false;
  const bits = BITS[client.version];
  return entries.some((entry) => {
    const network = parseNetwork(entry);
    if (!network || network.version !== client.version) return false;
    const hostBits = BigInt(bits - network.prefix);
    return client.value >> hostBits === network.network >> hostBits;
  });
}
