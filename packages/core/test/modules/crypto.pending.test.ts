import { describe, expect, it } from 'vitest';
import { vaultCrypto } from '../../src/index';
import { createMemoryPlatform } from '../../src/testing/index';

const { createVault, openVault, paddedSize } = vaultCrypto;
const bytes = (s: string) => new TextEncoder().encode(s);

describe('crypto (vault)', () => {
  it('encrypts a document that only the passphrase can open', async () => {
    const platform = createMemoryPlatform();
    const { header, keyring } = await createVault(platform, 'correct horse battery staple');
    const sealed = await keyring.encryptDocument('doc-1', bytes('my secret'));

    const reopened = openVault(platform, header);
    expect(reopened.locked).toBe(true);
    await expect(reopened.unlock('wrong passphrase')).rejects.toThrow();
    await reopened.unlock('correct horse battery staple');
    expect(await reopened.decryptDocument('doc-1', sealed)).toEqual(bytes('my secret'));
  });

  it('uses a fresh data key per document, bound to the document id', async () => {
    const platform = createMemoryPlatform();
    const { keyring } = await createVault(platform, 'pass');
    const a = await keyring.encryptDocument('doc-a', bytes('same'));
    const b = await keyring.encryptDocument('doc-b', bytes('same'));
    expect(a.wrappedKey.ciphertext).not.toEqual(b.wrappedKey.ciphertext);
    await expect(keyring.decryptDocument('doc-b', a)).rejects.toThrow();
  });

  it('refuses to work while locked', async () => {
    const platform = createMemoryPlatform();
    const { keyring } = await createVault(platform, 'pass');
    const sealed = await keyring.encryptDocument('d', bytes('x'));
    keyring.lock();
    expect(keyring.locked).toBe(true);
    await expect(keyring.encryptDocument('d', bytes('y'))).rejects.toThrow();
    await expect(keyring.decryptDocument('d', sealed)).rejects.toThrow();
  });

  it('relocks automatically after the timer, unless touched', async () => {
    const platform = createMemoryPlatform();
    const { keyring } = await createVault(platform, 'pass');
    keyring.setAutoLock(5 * 60_000);
    platform.clock.advance(4 * 60_000);
    keyring.touch();
    platform.clock.advance(4 * 60_000);
    expect(keyring.locked).toBe(false);
    platform.clock.advance(2 * 60_000);
    expect(keyring.locked).toBe(true);
  });

  it('recovers with the 24-word phrase when the passphrase is forgotten', async () => {
    const platform = createMemoryPlatform();
    const { header, recoveryPhrase, keyring } = await createVault(platform, 'forgotten');
    expect(recoveryPhrase).toHaveLength(24);
    const sealed = await keyring.encryptDocument('d', bytes('still mine'));
    const reopened = openVault(platform, header);
    await reopened.unlockWithRecoveryPhrase(recoveryPhrase);
    expect(await reopened.decryptDocument('d', sealed)).toEqual(bytes('still mine'));
    const wrong = [...recoveryPhrase].reverse();
    await expect(openVault(platform, header).unlockWithRecoveryPhrase(wrong)).rejects.toThrow();
  });

  it('never stores the passphrase or recovery phrase in the header', async () => {
    const platform = createMemoryPlatform();
    const { header, recoveryPhrase } = await createVault(platform, 'hunter2-passphrase');
    const dump = JSON.stringify(header, (_k, v) =>
      v instanceof Uint8Array ? new TextDecoder().decode(v) : v,
    );
    expect(dump).not.toContain('hunter2-passphrase');
    expect(dump).not.toContain(recoveryPhrase[0]);
  });

  it('pads attachment sizes into buckets', () => {
    expect(paddedSize(1)).toBe(paddedSize(1000));
    expect(paddedSize(5_000_000)).toBeGreaterThanOrEqual(5_000_000);
    expect(paddedSize(5_000_000)).toBe(paddedSize(5_000_001));
  });
});
