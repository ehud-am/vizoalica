import type { ReactNode } from 'react';

export interface Crumb {
  label: string;
  /** Omitted for plain text (a project name) and for the current page. */
  href?: string;
}

/**
 * Heading block for a Manage page: where you are (breadcrumb), how to go back, what the page is,
 * and the actions that belong to it.
 */
export function PageHeader({
  crumbs,
  title,
  description,
  back,
  status,
  actions
}: {
  crumbs: Crumb[];
  title: string;
  description?: string;
  back?: {
    label: string;
    href: string;
    onClick?: (event: React.MouseEvent<HTMLAnchorElement>) => void;
  };
  status?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="page-header">
      <nav aria-label="Breadcrumb" className="breadcrumb">
        <ol>
          {crumbs.map((crumb, index) => (
            <li key={`${crumb.label}-${index}`}>
              {crumb.href ? (
                <a href={crumb.href}>{crumb.label}</a>
              ) : (
                <span aria-current={index === crumbs.length - 1 ? 'page' : undefined}>
                  {crumb.label}
                </span>
              )}
            </li>
          ))}
        </ol>
      </nav>
      {back && (
        <a className="back-link" href={back.href} onClick={back.onClick}>
          <span aria-hidden="true">←</span> {back.label}
        </a>
      )}
      <div className="page-heading">
        <div>
          <h1>
            {title}
            {status}
          </h1>
          {description && <p>{description}</p>}
        </div>
        {actions && <div className="page-actions">{actions}</div>}
      </div>
    </header>
  );
}
