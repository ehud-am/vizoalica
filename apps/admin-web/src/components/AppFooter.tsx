export function AppFooter() {
  const injected = typeof __VIZOALICA_VERSION__ === 'string' ? __VIZOALICA_VERSION__.trim() : '';
  const version = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(injected)
    ? `Version ${injected}`
    : 'Version unavailable';
  return (
    <footer className="app-footer">
      <div className="app-footer-inner">
        <span>© {new Date().getFullYear()} Vizoalica</span>
        <span aria-hidden="true">•</span>
        <a href="https://vizoalica.dev">vizoalica.dev</a>
        <span aria-hidden="true">•</span>
        <a href="https://github.com/ehud-am/vizoalica">GitHub repository</a>
        <span aria-hidden="true">•</span>
        <span>{version}</span>
      </div>
    </footer>
  );
}
