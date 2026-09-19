import { CopyButton } from './CopyButton.js';

export interface IdentifierItem {
  label: string;
  value: string;
  /** For the copy button's accessible name: "project ID". */
  what: string;
}

/** Public identifiers, each with its own copy control. */
export function IdentifierList({ items }: { items: IdentifierItem[] }) {
  return (
    <dl className="identifiers">
      {items.map((item) => (
        <div key={item.label} className="identifier">
          <dt>{item.label}</dt>
          <dd>
            <code>{item.value}</code>
            <CopyButton text={item.value} what={item.what} className="link-button" />
          </dd>
        </div>
      ))}
    </dl>
  );
}

export const identifiersFor = (
  projectId: string,
  website: { id: string; publicSourceKey: string }
): IdentifierItem[] => [
  { label: 'Project ID', value: projectId, what: 'project ID' },
  { label: 'Website ID (source ID)', value: website.id, what: 'website ID' },
  { label: 'Public source key', value: website.publicSourceKey, what: 'public source key' }
];
