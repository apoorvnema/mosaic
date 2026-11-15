import { NotImplementedError } from '../errors';
import type { Crypto, Sealed } from '../platform/crypto';
import type { Clock } from '../platform/clock';

/** Stored beside the ciphertext so any device can re-derive the vault key. */
export interface VaultHeader {
  version: 1;
  salt: Uint8Array;
  opsLimit: number;
  memLimit: number;
  /** The vault key wrapped by the passphrase-derived key… */
  wrappedByPassphrase: Sealed;
  /** …and again by the recovery-phrase-derived key. */
  wrappedByRecovery: Sealed;
}

export interface EncryptedDocument {
  /** A fresh data key per document, wrapped by the vault key. */
  wrappedKey: Sealed;
  body: Sealed;
}

/**
 * Vault policy on top of the platform Crypto primitives: a passphrase that never
 * leaves the device, per-document keys, auto-relock, and a 24-word recovery phrase.
 * Holds key material only while unlocked.
 */
export interface VaultKeyring {
  readonly locked: boolean;
  unlock(passphrase: string): Promise<void>;
  unlockWithRecoveryPhrase(words: string[]): Promise<void>;
  /** Wipes key material from memory. */
  lock(): void;
  /** Relock automatically after `ms` without `touch()`. */
  setAutoLock(ms: number): void;
  touch(): void;
  /** Throws when locked. `docId` is bound as associated data. */
  encryptDocument(docId: string, plaintext: Uint8Array): Promise<EncryptedDocument>;
  decryptDocument(docId: string, doc: EncryptedDocument): Promise<Uint8Array>;
}

export interface CreatedVault {
  header: VaultHeader;
  /** Shown once at setup, never stored. */
  recoveryPhrase: string[];
  keyring: VaultKeyring;
}

export function createVault(
  _deps: { crypto: Crypto; clock: Clock },
  _passphrase: string,
): Promise<CreatedVault> {
  throw new NotImplementedError('crypto.createVault');
}

export function openVault(
  _deps: { crypto: Crypto; clock: Clock },
  _header: VaultHeader,
): VaultKeyring {
  throw new NotImplementedError('crypto.openVault');
}

/** Pad attachment sizes into buckets, because file size is a leak. */
export function paddedSize(_bytes: number): number {
  throw new NotImplementedError('crypto.paddedSize');
}
