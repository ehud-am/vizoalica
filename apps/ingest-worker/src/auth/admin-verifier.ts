function equalConstantTime(left: string, right: string): boolean {
  const leftBytes = new TextEncoder().encode(left);
  const rightBytes = new TextEncoder().encode(right);
  let difference = leftBytes.length ^ rightBytes.length;
  const length = Math.max(leftBytes.length, rightBytes.length);
  for (let index = 0; index < length; index += 1) {
    difference |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }
  return difference === 0;
}

export function hasValidAdminAuthorization(header: string | null, secret: string): boolean {
  const match = /^Bearer ([^\s]+)$/.exec(header ?? '');
  return match !== null && equalConstantTime(match[1]!, secret);
}
