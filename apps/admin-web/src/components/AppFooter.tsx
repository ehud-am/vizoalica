import {
  FOOTER_TAGLINE,
  PROJECT_LINKS,
  VIZOALICA_LINKS,
  type FooterLink
} from '../footer-links.js';

function LinkGroup({ title, links }: { title: string; links: readonly FooterLink[] }) {
  return (
    <nav className="app-footer-group" aria-label={title}>
      <h2 className="app-footer-heading">{title}</h2>
      <ul>
        {links.map((link) => (
          <li key={link.label}>
            <a
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`${link.label}: ${link.description} (opens in a new tab)`}
            >
              {link.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function AppFooter() {
  const injected = typeof __VIZOALICA_VERSION__ === 'string' ? __VIZOALICA_VERSION__.trim() : '';
  const version = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(injected)
    ? `Version ${injected}`
    : 'Version unavailable';
  return (
    <footer className="app-footer">
      <div className="app-footer-inner">
        <div className="app-footer-brand">
          <img
            className="brand-logo brand-logo-mark"
            data-testid="footer-mark"
            src="/brand/vizoalica-mark.svg"
            alt=""
            aria-hidden="true"
          />
          <div>
            <p className="app-footer-name">Vizoalica</p>
            <p className="app-footer-tagline">{FOOTER_TAGLINE}</p>
          </div>
        </div>
        <LinkGroup title="Vizoalica" links={VIZOALICA_LINKS} />
        <LinkGroup title="Project" links={PROJECT_LINKS} />
      </div>
      <div className="app-footer-legal">
        <span>© {new Date().getFullYear()} Vizoalica</span>
        <span aria-hidden="true">•</span>
        <span>{version}</span>
      </div>
    </footer>
  );
}
