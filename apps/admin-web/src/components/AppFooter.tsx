import { feedbackUrl } from '../feedback.js';
import { FOOTER_LINKS } from '../footer-links.js';

/**
 * One quiet line: the name and version, the website, the source, and a way to send alpha feedback.
 * Everything else lives on the website. The backend's version shows only when it differs from the
 * console's, which is when someone needs to know (Health says what to do).
 */
export function AppFooter({
  version,
  backendVersion,
  page
}: {
  version?: string | undefined;
  backendVersion?: string | null | undefined;
  page?: string | undefined;
} = {}) {
  const backendDiffers = !!version && !!backendVersion && backendVersion !== version;
  const links = [
    ...FOOTER_LINKS,
    {
      label: 'Send feedback',
      href: feedbackUrl({ version, page }),
      description: 'share an idea or a problem on GitHub'
    }
  ];
  return (
    <footer className="app-footer">
      <p className="app-footer-line">
        <span className="app-footer-name">Vizoalica{version ? ` v${version}` : ''}</span>
        {backendDiffers && (
          <span className="app-footer-item">
            <span aria-hidden="true">·</span>
            <span>backend v{backendVersion}</span>
          </span>
        )}
        {links.map((link) => (
          <span key={link.label} className="app-footer-item">
            <span aria-hidden="true">·</span>
            <a
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`${link.label}: ${link.description} (opens in a new tab)`}
            >
              {link.label}
            </a>
          </span>
        ))}
      </p>
    </footer>
  );
}
