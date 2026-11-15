import { createExtensionPlatform } from '@mosaic/adapters/extension';
import type { RelayOnlyPlatform } from '@mosaic/core';
import { Logo } from '@mosaic/ui';
import '@mosaic/ui/styles.css';
import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';

/**
 * The popup. The extension has no file system: it is a sync client that holds
 * captured notes in chrome.storage until they reach the relay. The platform it
 * gets is RelayOnlyPlatform, so vault code cannot be called from here by mistake.
 */
function Popup() {
  const [platform, setPlatform] = useState<RelayOnlyPlatform>();
  const [queued, setQueued] = useState<number>();

  useEffect(() => {
    void createExtensionPlatform().then(async (p) => {
      setPlatform(p);
      setQueued((await p.storage.list('queue/')).length);
    });
  }, []);

  return (
    <div style={{ padding: 'var(--space-4)', display: 'grid', gap: 'var(--space-3)' }}>
      <div className="m-brand" style={{ padding: 0 }}>
        <Logo />
        <b>Mosaic</b>
      </div>
      <div className="m-card m-status">
        <div className="m-status-label">
          <span className="m-dot" data-state={platform ? 'ok' : 'pending'} />
          Offline queue
        </div>
        <div className="m-status-value">
          {queued === undefined ? 'Checking…' : `${queued} waiting`}
        </div>
        <div className="m-status-detail">Capture arrives in the extension session.</div>
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Popup />
  </StrictMode>,
);
