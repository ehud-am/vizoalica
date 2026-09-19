import type { Website } from '../api/local-operations.js';
import { hrefFor } from '../router.js';

/** One website in the list. The whole card is a single link to the website's page. */
export function WebsiteCard({ website }: { website: Website }) {
  const [first, ...rest] = website.allowedOrigins;
  return (
    <a className="website-card" href={hrefFor('manage/websites/:id', website.id)}>
      <span className="site-avatar" aria-hidden="true">
        {website.name.slice(0, 1).toUpperCase()}
      </span>
      <span className="card-main">
        <strong>{website.name}</strong>
        <small>
          {first ?? 'No origin'}
          {rest.length > 0 && ` +${rest.length} more`}
        </small>
      </span>
      <span className={`status ${website.status}`}>{website.status}</span>
    </a>
  );
}
