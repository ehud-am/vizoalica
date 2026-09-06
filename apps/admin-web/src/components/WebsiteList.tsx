import type { Website } from '../api/local-operations.js';
export function WebsiteList({
  websites,
  selectedId,
  onSelect
}: {
  websites: Website[];
  selectedId: string;
  onSelect: (website: Website) => void;
}) {
  if (!websites.length)
    return (
      <div className="empty-list">
        <strong>No websites yet</strong>
        <span>Add your first website to begin collecting private analytics.</span>
      </div>
    );
  return (
    <ul className="website-list">
      {websites.map((website) => (
        <li key={website.id}>
          <button
            className={selectedId === website.id ? 'website-row selected' : 'website-row'}
            onClick={() => onSelect(website)}
          >
            <span className="site-avatar" aria-hidden="true">
              {website.name.slice(0, 1).toUpperCase()}
            </span>
            <span>
              <strong>{website.name}</strong>
              <small>{website.allowedOrigins[0]}</small>
            </span>
            <span className={`status ${website.status}`}>{website.status}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
