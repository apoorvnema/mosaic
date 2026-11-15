export interface KeyDerivationParams {
  /** Argon2id operations limit. */
  opsLimit: number;
  /** Argon2id memory limit in bytes. */
  memLimit: number;
}

export interface Sealed {
  nonce: Uint8Array;
  ciphertext: Uint8Array;
}

/**
 * Primitives only: random, derive key, encrypt, decrypt, hash. Adapters back this
 * with libsodium (Argon2id, XChaCha20-Poly1305) — never hand-rolled. Policy (which
 * key encrypts what) lives in core's `crypto` module, on top of this interface.
 */
export interface Crypto {
  randomBytes(length: number): Uint8Array;
  /** Argon2id. Returns a 32-byte key. `salt` must be 16 bytes. */
  deriveKey(passphrase: string, salt: Uint8Array, params: KeyDerivationParams): Promise<Uint8Array>;
  /** XChaCha20-Poly1305 with a fresh random nonce. */
  encrypt(key: Uint8Array, plaintext: Uint8Array, associatedData?: Uint8Array): Promise<Sealed>;
  /** Throws when authentication fails. */
  decrypt(key: Uint8Array, sealed: Sealed, associatedData?: Uint8Array): Promise<Uint8Array>;
  /** SHA-256. */
  hash(data: Uint8Array): Promise<Uint8Array>;
}
