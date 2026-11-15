import type { Crypto, KeyDerivationParams, Sealed } from '../platform/crypto';
import type { LogFields, Logger, LogLevel } from '../platform/logger';
import type { Telemetry } from '../platform/telemetry';

export interface LogLine {
  level: LogLevel;
  scope: string;
  message: string;
  fields?: LogFields;
}

export class MemoryLogger implements Logger {
  constructor(
    readonly lines: LogLine[] = [],
    private scope = '',
  ) {}
  log(level: LogLevel, message: string, fields?: LogFields): void {
    this.lines.push({ level, scope: this.scope, message, ...(fields ? { fields } : {}) });
  }
  child(scope: string): Logger {
    return new MemoryLogger(this.lines, this.scope ? `${this.scope}.${scope}` : scope);
  }
}

export class MemoryTelemetry implements Telemetry {
  readonly events: { name: string; properties?: Record<string, string | number | boolean> }[] = [];
  readonly timings: { name: string; ms: number }[] = [];
  event(name: string, properties?: Record<string, string | number | boolean>): void {
    this.events.push({ name, ...(properties ? { properties } : {}) });
  }
  timing(name: string, ms: number): void {
    this.timings.push({ name, ms });
  }
}

/**
 * TEST ONLY. Deterministic and NOT SECURE: a toy keystream stands in for real
 * primitives so core logic can be tested without WASM. Real adapters use libsodium.
 * It does keep the properties tests rely on: wrong key or tampering fails to decrypt.
 */
export class InsecureTestCrypto implements Crypto {
  private counter = 1;

  randomBytes(length: number): Uint8Array {
    const out = new Uint8Array(length);
    let x = (this.counter++ * 2654435761) >>> 0;
    for (let i = 0; i < length; i++) {
      x = (Math.imul(x ^ (x >>> 15), 2246822507) + 0x9e3779b9) >>> 0;
      out[i] = x & 0xff;
    }
    return out;
  }

  async deriveKey(
    pass: string,
    salt: Uint8Array,
    _params: KeyDerivationParams,
  ): Promise<Uint8Array> {
    return this.digest(concat(new TextEncoder().encode(pass), salt));
  }

  async encrypt(key: Uint8Array, plaintext: Uint8Array, aad?: Uint8Array): Promise<Sealed> {
    const nonce = this.randomBytes(24);
    const body = this.xor(key, nonce, plaintext);
    const tag = this.digest(concat(key, nonce, body, aad ?? new Uint8Array()));
    return { nonce, ciphertext: concat(body, tag) };
  }

  async decrypt(key: Uint8Array, sealed: Sealed, aad?: Uint8Array): Promise<Uint8Array> {
    const body = sealed.ciphertext.slice(0, -32);
    const tag = sealed.ciphertext.slice(-32);
    const expected = this.digest(concat(key, sealed.nonce, body, aad ?? new Uint8Array()));
    if (tag.length !== 32 || expected.some((b, i) => b !== tag[i])) {
      throw new Error('Decryption failed: authentication tag mismatch');
    }
    return this.xor(key, sealed.nonce, body);
  }

  async hash(data: Uint8Array): Promise<Uint8Array> {
    return this.digest(data);
  }

  private xor(key: Uint8Array, nonce: Uint8Array, data: Uint8Array): Uint8Array {
    const out = new Uint8Array(data.length);
    let block: Uint8Array = new Uint8Array();
    for (let i = 0; i < data.length; i++) {
      if (i % 32 === 0)
        block = this.digest(concat(key, nonce, new Uint8Array([i >>> 5, i >>> 13])));
      out[i] = (data[i] ?? 0) ^ (block[i % 32] ?? 0);
    }
    return out;
  }

  /** 32 bytes of FNV-style mixing. Collision resistance is not a goal. */
  private digest(data: Uint8Array): Uint8Array {
    const out = new Uint8Array(32);
    for (let lane = 0; lane < 8; lane++) {
      let h = (0x811c9dc5 ^ Math.imul(lane + 1, 0x9e3779b1)) >>> 0;
      for (const byte of data) h = Math.imul(h ^ byte, 16777619) >>> 0;
      h = Math.imul(h ^ (h >>> 13), 0x5bd1e995) >>> 0;
      for (let b = 0; b < 4; b++) out[lane * 4 + b] = (h >>> (b * 8)) & 0xff;
    }
    return out;
  }
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}
