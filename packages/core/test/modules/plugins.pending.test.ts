import { describe, expect, it } from 'vitest';
import {
  createPluginHost,
  describeCapability,
  parseManifest,
  type PluginManifest,
} from '../../src/index';
import { createMemoryPlatform } from '../../src/testing/index';

const manifest: PluginManifest = {
  id: 'word-count',
  name: 'Word count',
  version: '1.0.0',
  main: 'main.js',
  capabilities: [
    { kind: 'notes.read', query: 'folder:Journal' },
    { kind: 'network', hosts: ['api.example.com'] },
  ],
};

describe('plugins', () => {
  it('parses a manifest and rejects one with unknown capabilities', () => {
    expect(parseManifest(JSON.stringify(manifest))).toEqual(manifest);
    const bad = { ...manifest, capabilities: [{ kind: 'filesystem.everything' }] };
    expect(() => parseManifest(JSON.stringify(bad))).toThrow();
    expect(() => parseManifest('{"id":"x"}')).toThrow();
  });

  it('describes each capability in plain language for the install screen', () => {
    const text = describeCapability({ kind: 'network', hosts: ['api.example.com'] });
    expect(text).toContain('api.example.com');
    expect(text).not.toMatch(/[{}[\]]/);
    expect(describeCapability({ kind: 'vault' }).toLowerCase()).toContain('vault');
  });

  it('authorizes only what was granted — nothing is ambient', async () => {
    const host = createPluginHost(createMemoryPlatform());
    await host.install(manifest, manifest.capabilities);
    const ask = (capability: 'notes.read' | 'notes.write' | 'network' | 'vault', target: string) =>
      host.authorize({ pluginId: 'word-count', capability, target });
    expect(ask('notes.read', 'Journal/2026-09-10.md')).toBe(true);
    expect(ask('notes.read', 'Work/secret.md')).toBe(false);
    expect(ask('notes.write', 'Journal/2026-09-10.md')).toBe(false);
    expect(ask('network', 'api.example.com')).toBe(true);
    expect(ask('network', 'evil.example.net')).toBe(false);
  });

  it('does not grant what the manifest declared but the user declined', async () => {
    const host = createPluginHost(createMemoryPlatform());
    await host.install(manifest, [manifest.capabilities[0]!]);
    expect(
      host.authorize({ pluginId: 'word-count', capability: 'network', target: 'api.example.com' }),
    ).toBe(false);
  });

  it('keeps the vault off unless explicitly granted', async () => {
    const host = createPluginHost(createMemoryPlatform());
    await host.install(manifest, manifest.capabilities);
    expect(host.authorize({ pluginId: 'word-count', capability: 'vault', target: '' })).toBe(false);
  });

  it('suspends a plugin that blows its time budget, and names it', async () => {
    const host = createPluginHost(createMemoryPlatform(), {
      maxCallMs: 50,
      maxMemoryBytes: 1 << 26,
    });
    await host.install(manifest, manifest.capabilities);
    const notices: [string, string][] = [];
    host.onSuspended((id, reason) => notices.push([id, reason]));
    host.recordCall('word-count', 10);
    expect(host.state('word-count')).toBe('running');
    host.recordCall('word-count', 900);
    expect(host.state('word-count')).toBe('suspended');
    expect(notices[0]?.[0]).toBe('word-count');
    expect(
      host.authorize({ pluginId: 'word-count', capability: 'notes.read', target: 'Journal/a.md' }),
    ).toBe(false);
  });
});
