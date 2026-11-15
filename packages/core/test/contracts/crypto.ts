import { describe, expect, it } from 'vitest';
import type { Crypto } from '../../src/index';

export function cryptoContract(name: string, make: () => Promise<Crypto>): void {
  describe(`Crypto contract: ${name}`, () => {
    const text = (s: string) => new TextEncoder().encode(s);
    // Deliberately cheap Argon2 parameters: this checks behaviour, not strength.
    const params = { opsLimit: 1, memLimit: 8 * 1024 * 1024 };

    it('returns random bytes of the requested length', async () => {
      const crypto = await make();
      const a = crypto.randomBytes(32);
      const b = crypto.randomBytes(32);
      expect(a.length).toBe(32);
      expect(a).not.toEqual(b);
    });

    it('derives the same 32-byte key from the same passphrase and salt', async () => {
      const crypto = await make();
      const salt = crypto.randomBytes(16);
      const k1 = await crypto.deriveKey('correct horse', salt, params);
      const k2 = await crypto.deriveKey('correct horse', salt, params);
      const k3 = await crypto.deriveKey('wrong horse', salt, params);
      expect(k1.length).toBe(32);
      expect(k1).toEqual(k2);
      expect(k1).not.toEqual(k3);
    });

    it('decrypts what it encrypted, with a fresh nonce each time', async () => {
      const crypto = await make();
      const key = crypto.randomBytes(32);
      const aad = text('doc-1');
      const one = await crypto.encrypt(key, text('secret note'), aad);
      const two = await crypto.encrypt(key, text('secret note'), aad);
      expect(one.nonce).not.toEqual(two.nonce);
      expect(one.ciphertext).not.toEqual(text('secret note'));
      expect(await crypto.decrypt(key, one, aad)).toEqual(text('secret note'));
    });

    it('refuses a wrong key, tampered ciphertext, or wrong associated data', async () => {
      const crypto = await make();
      const key = crypto.randomBytes(32);
      const sealed = await crypto.encrypt(key, text('secret'), text('doc-1'));
      await expect(crypto.decrypt(crypto.randomBytes(32), sealed, text('doc-1'))).rejects.toThrow();
      await expect(crypto.decrypt(key, sealed, text('doc-2'))).rejects.toThrow();
      const tampered = { nonce: sealed.nonce, ciphertext: sealed.ciphertext.slice() };
      tampered.ciphertext[0] = (tampered.ciphertext[0] ?? 0) ^ 1;
      await expect(crypto.decrypt(key, tampered, text('doc-1'))).rejects.toThrow();
    });

    it('hashes deterministically to 32 bytes', async () => {
      const crypto = await make();
      const h1 = await crypto.hash(text('abc'));
      expect(h1.length).toBe(32);
      expect(h1).toEqual(await crypto.hash(text('abc')));
      expect(h1).not.toEqual(await crypto.hash(text('abd')));
    });
  });
}
