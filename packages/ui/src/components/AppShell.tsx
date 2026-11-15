import { useEffect, useState, type ReactNode } from 'react';
import { nextTheme } from '../theme';
import { BoardIcon, CanvasIcon, Logo, MoonIcon, NotebookIcon, SearchIcon, SunIcon } from './icons';

export type Surface = 'board' | 'notebooks' | 'canvas';

const SURFACES: { id: Surface; label: string; icon: ReactNode }[] = [
  { id: 'board', label: 'Board', icon: <BoardIcon /> },
  { id: 'notebooks', label: 'Notebooks', icon: <NotebookIcon /> },
  { id: 'canvas', label: 'Canvas', icon: <CanvasIcon /> },
];

function useTheme(): ['light' | 'dark', () => void] {
  const [theme, setTheme] = useState<'light' | 'dark'>(() =>
    document.documentElement.dataset.theme === 'dark' ||
    (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches)
      ? 'dark'
      : 'light',
  );
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  return [theme, () => setTheme(nextTheme)];
}

export interface AppShellProps {
  surface: Surface;
  onSurfaceChange: (surface: Surface) => void;
  /** Shown at the foot of the sidebar, e.g. the platform name. */
  footer?: ReactNode;
  children: ReactNode;
}

/**
 * The frame every shell renders: a sidebar on wide screens, bottom tabs on a
 * phone. Board, Notebooks and Canvas are lenses on the same notes.
 */
export function AppShell({ surface, onSurfaceChange, footer, children }: AppShellProps) {
  const [theme, toggleTheme] = useTheme();
  const brand = (
    <div className="m-brand">
      <Logo />
      <b>Mosaic</b>
    </div>
  );

  return (
    <div className="m-shell">
      <aside className="m-sidebar">
        {brand}
        <nav className="m-nav" aria-label="Surfaces">
          {SURFACES.map((s) => (
            <button
              key={s.id}
              type="button"
              className="m-nav-item"
              aria-current={surface === s.id ? 'page' : undefined}
              onClick={() => onSurfaceChange(s.id)}
            >
              {s.icon}
              {s.label}
            </button>
          ))}
        </nav>
        <div className="m-sidebar-foot">{footer}</div>
      </aside>

      <div className="m-main">
        <header className="m-topbar">
          {brand}
          <button type="button" className="m-search" aria-label="Search notes" disabled>
            <SearchIcon />
            <span>Search notes</span>
            <kbd className="m-kbd">Ctrl K</kbd>
          </button>
          <button
            type="button"
            className="m-icon-button"
            aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            onClick={toggleTheme}
          >
            {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
          </button>
        </header>
        <main className="m-content">
          <div className="m-content-inner">{children}</div>
        </main>
      </div>

      <nav className="m-tabs" aria-label="Surfaces">
        {SURFACES.map((s) => (
          <button
            key={s.id}
            type="button"
            className="m-tab"
            aria-current={surface === s.id ? 'page' : undefined}
            onClick={() => onSurfaceChange(s.id)}
          >
            {s.icon}
            {s.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
