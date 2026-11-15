import type { Platform } from '@mosaic/core';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MosaicApp, StartupError } from './MosaicApp';

/**
 * Shared entry point for every shell: build the platform, render the app. The
 * frame is on screen before the platform resolves, so there is never a blank
 * window while SQLite and libsodium load.
 */
export function mountMosaic(element: HTMLElement, createPlatform: () => Promise<Platform>): void {
  const root = createRoot(element);
  createPlatform().then(
    (platform) =>
      root.render(
        <StrictMode>
          <MosaicApp platform={platform} />
        </StrictMode>,
      ),
    (error: unknown) => {
      console.error(error);
      root.render(<StartupError error={error} />);
    },
  );
}
