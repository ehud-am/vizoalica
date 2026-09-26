/** Where the footer points. External, opened in a new tab, and never requested until followed. */
export type FooterLink = { label: string; href: string; description: string };

export const FOOTER_LINKS: readonly FooterLink[] = [
  { label: 'vizoalica.dev', href: 'https://vizoalica.dev', description: 'the Vizoalica website' },
  {
    label: 'GitHub',
    href: 'https://github.com/ehud-am/vizoalica',
    description: 'the project on GitHub'
  }
];
