import type { Platform } from '@mosaic/core';
import { useVault } from './app/useVault';
import { Workspace } from './app/Workspace';

/**
 * The whole app, for every shell. A shell's only job is to build a Platform from
 * its adapter and render this. Anything a shell needs to do differently belongs
 * behind the Platform interface, not in a fork of this component.
 */
export function MosaicApp({ platform }: { platform: Platform }) {
  const { vault, error } = useVault(platform);
  if (error) return <StartupError error={error} />;
  // The index is local, so this is brief; render the frame rather than a spinner.
  if (!vault) return <div className="m-shell" data-view="list" aria-busy="true" />;
  return <Workspace vault={vault} />;
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
