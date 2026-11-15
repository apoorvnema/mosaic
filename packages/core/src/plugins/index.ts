import { NotImplementedError } from '../errors';
import type { RelayOnlyPlatform } from '../platform/index';

/** What a plugin may ask for. Nothing is ambient; each is declared and shown at install. */
export type Capability =
  | { kind: 'notes.read'; query: string }
  | { kind: 'notes.write'; folder: string }
  | { kind: 'network'; hosts: string[] }
  | { kind: 'ui.view'; id: string }
  | { kind: 'ui.command'; id: string }
  /** Off by default; a separate explicit grant, with a visible indicator while in use. */
  | { kind: 'vault' };

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  /** Entry module, relative to the plugin folder. */
  main: string;
  capabilities: Capability[];
}

export interface PluginBudget {
  /** Longest a single call may run before the plugin is suspended. */
  maxCallMs: number;
  maxMemoryBytes: number;
}

export type PluginState = 'installed' | 'running' | 'suspended' | 'disabled';

/** A request from the sandbox, checked against granted capabilities by the host. */
export interface PluginRequest {
  pluginId: string;
  capability: Capability['kind'];
  /** The concrete thing asked for: a note path, a host name, a view id. */
  target: string;
}

export function parseManifest(_json: string): PluginManifest {
  throw new NotImplementedError('plugins.parseManifest');
}

/** One plain-language sentence per capability, for the install screen. */
export function describeCapability(_capability: Capability): string {
  throw new NotImplementedError('plugins.describeCapability');
}

/**
 * The host side of the sandbox. Enforcement lives here, not in the runtime: the
 * shell supplies the iframe + worker + message port, core decides what is allowed.
 */
export interface PluginHost {
  install(manifest: PluginManifest, granted: Capability[]): Promise<void>;
  uninstall(pluginId: string): Promise<void>;
  state(pluginId: string): PluginState;
  /** True only when a granted capability covers the request. */
  authorize(request: PluginRequest): boolean;
  /** Report how long a call took; over budget suspends the plugin and names it. */
  recordCall(pluginId: string, ms: number): void;
  onSuspended(listener: (pluginId: string, reason: string) => void): () => void;
}

export function createPluginHost(_platform: RelayOnlyPlatform, _budget?: PluginBudget): PluginHost {
  throw new NotImplementedError('plugins');
}
