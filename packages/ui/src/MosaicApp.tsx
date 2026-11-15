import type { Platform } from '@mosaic/core';
import { useState } from 'react';
import { AppShell, type Surface } from './components/AppShell';
import { FoundationStatus } from './components/FoundationStatus';

const COMING: Record<Exclude<Surface, 'board'>, string> = {
  notebooks: 'Notebooks, sections and pages arrive with the Board in a later session.',
  canvas: 'The infinite canvas and ink layer arrive in the canvas session.',
};

/**
 * The whole app, for every shell. A shell's only job is to build a Platform from
 * its adapter and render this. Anything a shell needs to do differently belongs
 * behind the Platform interface, not in a fork of this component.
 */
export function MosaicApp({ platform }: { platform: Platform }) {
  const [surface, setSurface] = useState<Surface>('board');
  return (
    <AppShell surface={surface} onSurfaceChange={setSurface} footer={<span>{platform.name}</span>}>
      {surface === 'board' ? (
        <FoundationStatus platform={platform} />
      ) : (
        <div className="m-card m-empty">{COMING[surface]}</div>
      )}
    </AppShell>
  );
}

/** What a shell shows if its platform fails to start. Never a blank window. */
export function StartupError({ error }: { error: unknown }) {
  return (
    <div className="m-centered" role="alert">
      <div>
        <h1 style={{ fontSize: 'var(--text-lg)', color: 'var(--text)' }}>Mosaic could not start</h1>
        <p style={{ marginTop: 'var(--space-2)' }}>
          {error instanceof Error ? error.message : String(error)}
        </p>
      </div>
    </div>
  );
}
