export function AppFooter() {
  const version = typeof __VIZOALICA_VERSION__ === 'string' ? __VIZOALICA_VERSION__ : 'unknown';
  return (
    <footer className="app-footer">
      {new Date().getFullYear()} | Vizoalica | v{version}
    </footer>
  );
}
