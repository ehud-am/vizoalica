import { FOOTER_LINKS } from '../footer-links.js';

/** One quiet line: the name, the website, the source. Everything else lives on the website. */
export function AppFooter() {
  return (
    <footer className="app-footer">
      <p className="app-footer-line">
        <span className="app-footer-name">Vizoalica</span>
        {FOOTER_LINKS.map((link) => (
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
