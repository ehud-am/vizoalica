import { isTokenLike } from './page-path.js';
import { privacyLimits } from './policy.js';

const EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/g;
// Six or more digits, allowing single separators, so phone and card numbers are caught too.
const LONG_DIGITS = /\d(?:[\s().-]?\d){5,}/g;
// Labels are short button text; bounding the input keeps the work constant for huge elements.
const MAX_INPUT_LENGTH = 400;

/**
 * Makes a control's text safe to store as an action name: whitespace collapsed, email addresses,
 * long digit runs, and token-shaped words replaced by placeholders, then cut to the name limit.
 * Idempotent, and never throws.
 */
export function redactLabel(
  input: unknown,
  maxLength: number = privacyLimits.maxActionNameLength
): string {
  try {
    const collapsed = String(input ?? '')
      .slice(0, MAX_INPUT_LENGTH)
      // Control characters (C0 and C1) never belong in a label; some are used as separators later.
      .replace(/[\u0000-\u0008\u000e-\u001f\u007f-\u009f]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    const redacted = collapsed
      .replace(EMAIL, '[email]')
      .replace(LONG_DIGITS, '[number]')
      .split(' ')
      .map((word) => (isTokenLike(word) ? '[token]' : word))
      .join(' ');
    return redacted.slice(0, maxLength).trim();
  } catch {
    return '';
  }
}
