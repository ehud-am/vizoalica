import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { size?: 16 | 20 | 24 };

function IconFrame({ size = 20, children, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      focusable="false"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export function AnalyticsIcon(props: IconProps) {
  return (
    <IconFrame {...props}>
      <path d="M4 18V9m6 9V5m6 13v-7m4 7H2" />
    </IconFrame>
  );
}

export function WebsitesIcon(props: IconProps) {
  return (
    <IconFrame {...props}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 8h18M7 6h.01M10 6h.01" />
    </IconFrame>
  );
}

export function ProjectsIcon(props: IconProps) {
  return (
    <IconFrame {...props}>
      <path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <path d="M3 10h18" />
    </IconFrame>
  );
}

export function LockIcon(props: IconProps) {
  return (
    <IconFrame {...props}>
      <rect x="4" y="10" width="16" height="11" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </IconFrame>
  );
}

export function RefreshIcon(props: IconProps) {
  return (
    <IconFrame {...props}>
      <path d="M20 7v5h-5M4 17v-5h5" />
      <path d="M6.1 9A7 7 0 0 1 18.2 6L20 8M4 16l1.8 2A7 7 0 0 0 18 15" />
    </IconFrame>
  );
}

export function SunIcon(props: IconProps) {
  return (
    <IconFrame {...props}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </IconFrame>
  );
}

export function MoonIcon(props: IconProps) {
  return (
    <IconFrame {...props}>
      <path d="M20 15.2A8 8 0 0 1 8.8 4 8 8 0 1 0 20 15.2z" />
    </IconFrame>
  );
}

export function PlusIcon(props: IconProps) {
  return (
    <IconFrame {...props}>
      <path d="M12 5v14M5 12h14" />
    </IconFrame>
  );
}

export function CopyIcon(props: IconProps) {
  return (
    <IconFrame {...props}>
      <rect x="8" y="8" width="12" height="12" rx="2" />
      <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
    </IconFrame>
  );
}

export function ChevronDownIcon(props: IconProps) {
  return (
    <IconFrame {...props}>
      <path d="m7 10 5 5 5-5" />
    </IconFrame>
  );
}

export function CheckCircleIcon(props: IconProps) {
  return (
    <IconFrame {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="m8 12 2.5 2.5L16.5 9" />
    </IconFrame>
  );
}

export function AlertTriangleIcon(props: IconProps) {
  return (
    <IconFrame {...props}>
      <path d="M10.3 3.7 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.7a2 2 0 0 0-3.4 0z" />
      <path d="M12 9v4m0 4h.01" />
    </IconFrame>
  );
}

export function InfoIcon(props: IconProps) {
  return (
    <IconFrame {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5m0-8h.01" />
    </IconFrame>
  );
}
