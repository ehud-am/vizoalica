import type { RoleHint } from '../api/local-operations.js';

export type RoleChoice = {
  hint: RoleHint;
  label: string;
  /** The first-run question's answer, in the person's own words. */
  blurb: string;
  can: string;
  cannot: string;
};

export const ROLE_CHOICES: readonly RoleChoice[] = [
  {
    hint: 'admin',
    label: 'Admin',
    blurb: 'I look after the backend',
    can: 'Sets up and updates the backend, manages projects and websites, and sees every result.',
    cannot: 'Nothing is off limits.'
  },
  {
    hint: 'website-owner',
    label: 'Website owner',
    blurb: 'I need to make a website send data',
    can: 'Manages projects and websites within what you were given, installs them, and sees results.',
    cannot: 'Cannot change the backend, its secrets, or who has access.'
  },
  {
    hint: 'analyst',
    label: 'Analyst',
    blurb: 'I only look at results',
    can: 'Sees results and the configuration.',
    cannot: 'Changes nothing.'
  }
];

export const roleLabel = (hint: RoleHint | undefined): string =>
  ROLE_CHOICES.find((choice) => choice.hint === hint)?.label ?? 'Admin';

/** What each role is asked to enter to connect. */
export const CREDENTIAL_LABEL: Record<RoleHint, string> = {
  admin: 'Administrator secret',
  'website-owner': 'Access key',
  analyst: 'Access key'
};
