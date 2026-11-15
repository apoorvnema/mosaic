import type { ReactNode, SVGProps } from 'react';

function Icon({ children, ...props }: SVGProps<SVGSVGElement> & { children: ReactNode }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export const BoardIcon = () => (
  <Icon>
    <rect x="3" y="3" width="8" height="10" rx="2" />
    <rect x="13" y="3" width="8" height="6" rx="2" />
    <rect x="3" y="15" width="8" height="6" rx="2" />
    <rect x="13" y="11" width="8" height="10" rx="2" />
  </Icon>
);

export const NotebookIcon = () => (
  <Icon>
    <path d="M6 3h11a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6z" />
    <path d="M6 3v18M3 8h3M3 12h3M3 16h3M10 8h5" />
  </Icon>
);

export const CanvasIcon = () => (
  <Icon>
    <path d="M3 17c3-6 5 2 8-4s4-7 10-6" />
    <circle cx="5" cy="6" r="2" />
    <rect x="15" y="14" width="6" height="6" rx="1.5" />
  </Icon>
);

export const SearchIcon = () => (
  <Icon width="16" height="16">
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </Icon>
);

export const SunIcon = () => (
  <Icon>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </Icon>
);

export const MoonIcon = () => (
  <Icon>
    <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" />
  </Icon>
);

export const FileIcon = () => (
  <Icon width="16" height="16">
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
    <path d="M14 3v5h5" />
  </Icon>
);

/** Four tiles, four note colours: the mosaic. */
export function Logo({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <rect x="1" y="1" width="10" height="10" rx="3" fill="#5b5bd6" />
      <rect x="13" y="1" width="10" height="10" rx="3" fill="#f3c84b" />
      <rect x="1" y="13" width="10" height="10" rx="3" fill="#3fb8a8" />
      <rect x="13" y="13" width="10" height="10" rx="3" fill="#f0817a" />
    </svg>
  );
}
