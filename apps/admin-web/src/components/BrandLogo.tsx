import type { Theme } from '../theme.js';

export function BrandLogo({ theme, compact = false }: { theme: Theme; compact?: boolean }) {
  const src = compact ? '/brand/vizoalica-mark.svg' : `/brand/vizoalica-lockup-${theme}.svg`;
  const image = (
    <img
      className={compact ? 'brand-logo brand-logo-mark' : 'brand-logo brand-logo-lockup'}
      data-testid="brand-logo"
      src={src}
      alt=""
      aria-hidden="true"
    />
  );
  if (compact) return image;
  return (
    <picture className="brand-logo-picture">
      <source media="(max-width: 639px)" srcSet="/brand/vizoalica-mark.svg" />
      {image}
    </picture>
  );
}
