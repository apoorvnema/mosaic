/** Thrown by module stubs whose behaviour is specified by tests but not built yet. */
export class NotImplementedError extends Error {
  constructor(what: string) {
    super(`${what} is not implemented yet`);
    this.name = 'NotImplementedError';
  }
}

/** Thrown by an adapter when the platform genuinely cannot do something. */
export class PlatformUnsupportedError extends Error {
  constructor(what: string, platform: string) {
    super(`${what} is not available on ${platform}`);
    this.name = 'PlatformUnsupportedError';
  }
}

export class FileNotFoundError extends Error {
  constructor(readonly path: string) {
    super(`No such file: ${path}`);
    this.name = 'FileNotFoundError';
  }
}
