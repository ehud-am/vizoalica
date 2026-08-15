import type { TokenProvider } from './types.js';

export async function resolveToken(tokenProvider?: TokenProvider): Promise<string | undefined> {
  return tokenProvider ? await tokenProvider() : undefined;
}
