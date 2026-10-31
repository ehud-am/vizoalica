// Fills the README's pixel block from the pipeline's public settings. The block sits between two
// markers and is empty in the repository; with no endpoint or website key it stays empty, so a
// README never shows a broken image.
const START = '<!-- readme-pixel:start -->';
const END = '<!-- readme-pixel:end -->';

/** The pixel image for `path`, or '' when the settings are incomplete or not a valid https endpoint. */
export function pixelMarkdown({ endpoint, websiteKey, path }) {
  if (!endpoint || !websiteKey) return '';
  let base;
  try {
    base = new URL('/v1/pixel.gif', endpoint);
  } catch {
    return '';
  }
  if (base.protocol !== 'https:') return '';
  base.searchParams.set('website', websiteKey);
  base.searchParams.set('path', path);
  return `![](${base.href})`;
}

/** Replaces what is between the markers; a file without markers is returned as it is. */
export function applyReadmePixel(text, settings) {
  const start = text.indexOf(START);
  const end = text.indexOf(END);
  if (start < 0 || end < start) return text;
  const image = pixelMarkdown(settings);
  return `${text.slice(0, start + START.length)}${image ? `\n${image}\n` : '\n'}${text.slice(end)}`;
}

/** The settings as the workflows pass them: public repository variables, secrets as a fallback. */
export function settingsFromEnv(env, path) {
  return {
    endpoint: env.VIZOALICA_INGEST_ENDPOINT,
    websiteKey: env.VIZOALICA_README_WEBSITE_KEY || env.VIZOALICA_WEBSITE_KEY,
    path
  };
}
