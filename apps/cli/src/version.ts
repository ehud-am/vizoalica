/** Replaced with the release version by scripts/build-package.mjs; a plain marker when run from source. */
declare const __VIZOALICA_VERSION__: string | undefined;

export const VERSION: string =
  typeof __VIZOALICA_VERSION__ === 'string' ? __VIZOALICA_VERSION__ : '0.0.0-dev';
