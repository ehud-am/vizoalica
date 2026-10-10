/** Where alpha feedback goes: a new discussion in GitHub's Ideas category, already filled in. */
export const FEEDBACK_BASE = 'https://github.com/ehud-am/vizoalica/discussions/new';

/**
 * The address of a new Ideas discussion that names the console's version and the screen the person
 * was on. It carries nothing else: no project, website, environment, host or analytics value.
 */
export function feedbackUrl(
  context: { version?: string | undefined; page?: string | undefined } = {}
): string {
  const lines = [
    '<!-- Vizoalica is in alpha. A rough note is fine. -->',
    '',
    '**What were you trying to do?**',
    '',
    '',
    '**What happened, or what was confusing?**',
    '',
    '',
    '**What would make it better?**',
    '',
    '',
    '---',
    `Console version: ${context.version ?? 'unknown'}`,
    `Screen: ${context.page ?? 'unknown'}`
  ];
  const params = new URLSearchParams({
    category: 'ideas',
    title: 'Alpha feedback: ',
    body: lines.join('\n')
  });
  return `${FEEDBACK_BASE}?${params.toString()}`;
}
