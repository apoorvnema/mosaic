export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type LogFields = Record<string, unknown>;

export interface Logger {
  log(level: LogLevel, message: string, fields?: LogFields): void;
  /** A logger that tags every line with `scope`, e.g. `sync`. */
  child(scope: string): Logger;
}
