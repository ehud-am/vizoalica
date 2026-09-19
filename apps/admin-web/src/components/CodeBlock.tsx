import { CopyButton } from './CopyButton.js';

/** A labelled, scrollable code sample with its own copy control. */
export function CodeBlock({
  label,
  code,
  what,
  disabled = false
}: {
  label: string;
  code: string;
  what: string;
  disabled?: boolean;
}) {
  return (
    <div className="code-block">
      <div className="code-head">
        <span>{label}</span>
        <CopyButton text={code} what={what} disabled={disabled} />
      </div>
      <pre tabIndex={0} role="region" aria-label={label}>
        <code>{code}</code>
      </pre>
    </div>
  );
}
