export const sensitiveUrlKeys = new Set([
  'token',
  'access_token',
  'refresh_token',
  'id_token',
  'password',
  'passwd',
  'secret',
  'api_key',
  'apikey',
  'key',
  'code',
  'auth',
  'session',
  'email',
  'phone'
]);

export const forbiddenPropertyNamePatterns = [
  /password/i,
  /passwd/i,
  /secret/i,
  /token/i,
  /api[_-]?key/i,
  /authorization/i,
  /cookie/i,
  /email/i,
  /phone/i,
  /credit[_-]?card/i,
  /card[_-]?number/i
] as const;

export const privacyLimits = {
  maxProperties: 25,
  maxPropertyNameLength: 64,
  maxPropertyValueLength: 256,
  maxUrlPathLength: 1024,
  maxTitleLength: 256,
  maxActionNameLength: 80
} as const;

export function isForbiddenPropertyName(name: string): boolean {
  return forbiddenPropertyNamePatterns.some((pattern) => pattern.test(name));
}
