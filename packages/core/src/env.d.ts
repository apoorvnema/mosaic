// Core compiles with `lib: ["ES2022"]` and no DOM or node types, so the handful of
// universal globals it is allowed to use are declared here by hand. Anything not
// declared in this file is, by construction, unavailable to core.
declare class TextEncoder {
  encode(input?: string): Uint8Array;
}
declare class TextDecoder {
  constructor(label?: string, options?: { fatal?: boolean; ignoreBOM?: boolean });
  decode(input?: Uint8Array): string;
}
