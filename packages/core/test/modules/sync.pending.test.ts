import { describe, expect, it } from 'vitest';
import {
  createSyncClient,
  type CrdtUpdate,
  type RelayTransport,
  type SyncState,
} from '../../src/index';
import { createMemoryPlatform } from '../../src/testing/index';

/** A relay the test controls: it can be offline, and it records what it acknowledged. */
function fakeRelay() {
  let online = true;
  const acked: { docId: string; update: CrdtUpdate }[] = [];
  const updateListeners = new Set<(docId: string, update: CrdtUpdate) => void>();
  const disconnectListeners = new Set<() => void>();
  const transport: RelayTransport = {
    async connect() {
      if (!online) throw new Error('offline');
    },
    disconnect() {},
    async push(docId, update) {
      if (!online) throw new Error('offline');
      acked.push({ docId, update });
    },
    async pull() {
      return [];
    },
    onUpdate(listener) {
      updateListeners.add(listener);
      return () => updateListeners.delete(listener);
    },
    onDisconnect(listener) {
      disconnectListeners.add(listener);
      return () => disconnectListeners.delete(listener);
    },
  };
  return {
    transport,
    acked,
    goOffline() {
      online = false;
      disconnectListeners.forEach((l) => l());
    },
    goOnline() {
      online = true;
    },
    deliver(docId: string, update: CrdtUpdate) {
      updateListeners.forEach((l) => l(docId, update));
    },
  };
}

const update = (n: number) => new Uint8Array([n]);
const flush = () => new Promise<void>((resolve) => queueMicrotask(resolve));
async function settle(times = 20) {
  for (let i = 0; i < times; i++) await flush();
}

describe('sync', () => {
  it('pushes queued updates in order and reports idle when drained', async () => {
    const platform = createMemoryPlatform();
    const relay = fakeRelay();
    const client = createSyncClient(platform, relay.transport);
    await client.start();
    await client.enqueue('doc', update(1));
    await client.enqueue('doc', update(2));
    await settle();
    expect(relay.acked.map((a) => a.update[0])).toEqual([1, 2]);
    expect(client.status()).toMatchObject({ state: 'idle', pending: 0 });
  });

  it('keeps accepting edits while offline', async () => {
    const platform = createMemoryPlatform();
    const relay = fakeRelay();
    relay.goOffline();
    const client = createSyncClient(platform, relay.transport);
    await client.start();
    await client.enqueue('doc', update(1));
    await client.enqueue('doc', update(2));
    expect(client.status()).toMatchObject({ state: 'offline', pending: 2 });
    expect(relay.acked).toEqual([]);
  });

  it('persists the offline queue across a restart', async () => {
    const platform = createMemoryPlatform();
    const relay = fakeRelay();
    relay.goOffline();
    const first = createSyncClient(platform, relay.transport);
    await first.start();
    await first.enqueue('doc', update(7));
    await first.stop();

    relay.goOnline();
    const second = createSyncClient(platform, relay.transport);
    await second.start();
    await settle();
    expect(relay.acked.map((a) => a.update[0])).toEqual([7]);
    expect(second.status().pending).toBe(0);
  });

  it('reconnects with exponential backoff and then drains the queue', async () => {
    const platform = createMemoryPlatform();
    const relay = fakeRelay();
    relay.goOffline();
    const client = createSyncClient(platform, relay.transport);
    const states: SyncState[] = [];
    client.onStatus((s) => states.push(s.state));
    await client.start();
    await client.enqueue('doc', update(1));

    platform.clock.advance(1_000);
    await settle();
    platform.clock.advance(2_000);
    await settle();
    expect(relay.acked).toEqual([]);

    relay.goOnline();
    platform.clock.advance(60_000);
    await settle();
    expect(relay.acked.map((a) => a.update[0])).toEqual([1]);
    expect(states).toContain('connecting');
    expect(states.at(-1)).toBe('idle');
  });

  it('never drops an update whose push failed mid-flight', async () => {
    const platform = createMemoryPlatform();
    const relay = fakeRelay();
    const client = createSyncClient(platform, relay.transport);
    await client.start();
    relay.goOffline();
    await client.enqueue('doc', update(1));
    await settle();
    expect(client.status().pending).toBe(1);
    relay.goOnline();
    platform.clock.advance(60_000);
    await settle();
    expect(relay.acked.map((a) => a.update[0])).toEqual([1]);
  });

  it('hands remote updates to listeners', async () => {
    const platform = createMemoryPlatform();
    const relay = fakeRelay();
    const client = createSyncClient(platform, relay.transport);
    const received: [string, number | undefined][] = [];
    client.onRemoteUpdate((docId, u) => received.push([docId, u[0]]));
    await client.start();
    relay.deliver('doc', update(9));
    expect(received).toEqual([['doc', 9]]);
  });
});
