import type { Crypto, KeyDerivationParams, Sealed } from '@mosaic/core';
import sodium from 'libsodium-wrappers-sumo';

/**
 * Crypto for every platform, backed by libsodium (WASM): Argon2id for key
 * derivation, XChaCha20-Poly1305 for authenticated encryption, SHA-256 for
 * hashing. One implementation everywhere, so every device agrees. Never hand-rolled.
 */
export async function createSodiumCrypto(): Promise<Crypto> {
  await sodium.ready;
  return {
    randomBytes: (length: number) => sodium.randombytes_buf(length),

    async deriveKey(passphrase: string, salt: Uint8Array, params: KeyDerivationParams) {
      if (salt.length !== sodium.crypto_pwhash_SALTBYTES) {
        throw new Error(`Salt must be ${sodium.crypto_pwhash_SALTBYTES} bytes`);
      }
      return sodium.crypto_pwhash(
        32,
        passphrase,
        salt,
        params.opsLimit,
        params.memLimit,
        sodium.crypto_pwhash_ALG_ARGON2ID13,
      );
    },

    async encrypt(
      key: Uint8Array,
      plaintext: Uint8Array,
      associatedData?: Uint8Array,
    ): Promise<Sealed> {
      const nonce = sodium.randombytes_buf(sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES);
      const ciphertext = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
        plaintext,
        associatedData ?? null,
        null,
        nonce,
        key,
      );
      return { nonce, ciphertext };
    },

    async decrypt(key: Uint8Array, sealed: Sealed, associatedData?: Uint8Array) {
      // libsodium throws on a bad tag; that is the contract.
      return sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
        null,
        sealed.ciphertext,
        associatedData ?? null,
        sealed.nonce,
        key,
      );
    },

    hash: async (data: Uint8Array) => sodium.crypto_hash_sha256(data),
  };
}
